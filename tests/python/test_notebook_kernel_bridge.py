"""Checks for the DataFrame display formatter the notebook kernel bridge
installs at kernel start (KERNEL_SETUP_CODE) and for the variable
inspection the Notebooks agent runs (KERNEL_INSPECT_CODE).

The bridge module itself redirects fd 1 on import, so only these constants
are evaluated here, then run in an in-process IPython shell.
"""

import ast
import json
import unittest
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from IPython.core.interactiveshell import InteractiveShell
except ImportError as exc:
    raise unittest.SkipTest(f"Optional notebook test dependencies unavailable: {exc}") from exc


BRIDGE_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "python" / "notebook_kernel_bridge.py"
)
SETUP_NAMES = {"KERNEL_DATAFRAME_MIME", "KERNEL_SETUP_CODE", "KERNEL_INSPECT_CODE"}


def load_setup_constants():
    tree = ast.parse(BRIDGE_PATH.read_text(encoding="utf-8"))
    nodes = [
        node
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id in SETUP_NAMES for t in node.targets)
    ]
    namespace = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(BRIDGE_PATH), "exec"), namespace)
    return (
        namespace["KERNEL_DATAFRAME_MIME"],
        namespace["KERNEL_SETUP_CODE"],
        namespace["KERNEL_INSPECT_CODE"],
    )


MIME, SETUP_CODE, INSPECT_CODE = load_setup_constants()


class DataFrameFormatterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shell = InteractiveShell.instance()
        result = cls.shell.run_cell(SETUP_CODE, silent=True, store_history=False)
        result.raise_error()

    def bundle(self, obj):
        data, _ = self.shell.display_formatter.format(obj)
        return data

    def test_dataframe_gets_rows_next_to_pandas_html(self):
        df = pd.DataFrame(
            {
                "id": range(1, 201),
                "time": pd.date_range("2022-09-01", periods=200, freq="1min", tz="UTC"),
                "requests": [1] * 200,
            }
        )
        data = self.bundle(df)
        self.assertIn("text/html", data)
        info = data[MIME]
        self.assertEqual(info["columns"], ["id", "time", "requests"])
        self.assertEqual(info["rowCount"], 200)
        self.assertEqual(info["totalRows"], 200)
        self.assertEqual(info["index"][:2], [0, 1])
        self.assertEqual(info["data"][0], [1, "2022-09-01 00:00:00+00:00", 1])

    def test_values_are_json_safe(self):
        df = pd.DataFrame(
            {
                "f": [1.5, np.nan, np.inf],
                "n": pd.array([1, None, 3], dtype="Int64"),
                "big": [2**60, 1, 2],
                "o": [[1, 2], None, {"k": 1}],
                "d": pd.to_datetime(["2020-01-01", None, "2021-01-01"]),
            }
        )
        df.columns = ["f", "f", "big", "o", "d"]  # duplicate names are fine
        info = self.bundle(df)[MIME]
        json.dumps(info, allow_nan=False)
        self.assertEqual(info["columns"], ["f", "f", "big", "o", "d"])
        self.assertEqual(info["data"][1], [None, None, 1, None, None])
        self.assertEqual(info["data"][2][0], "inf")
        self.assertEqual(info["data"][0][2], str(2**60))

    def test_rows_are_capped(self):
        info = self.bundle(pd.DataFrame({"x": range(50_000)}))[MIME]
        self.assertEqual(info["rowCount"], 20_000)
        self.assertEqual(info["totalRows"], 50_000)
        self.assertEqual(len(info["data"]), 20_000)

    def test_payload_size_is_capped(self):
        info = self.bundle(pd.DataFrame({"s": ["x" * 1000] * 20_000}))[MIME]
        self.assertLess(len(json.dumps(info)), 5_000_001)
        self.assertLess(info["rowCount"], 20_000)

    def test_safe_integer_boundary_matches_javascript(self):
        info = self.bundle(pd.DataFrame({"i": [2**53 - 1, 2**53, -(2**53)]}))[MIME]
        self.assertEqual(
            [row[0] for row in info["data"]], [2**53 - 1, str(2**53), str(-(2**53))]
        )

    def test_oversized_floor_drops_table_payload(self):
        data = self.bundle(pd.DataFrame({"s": ["x" * 60_000] * 200}))
        self.assertNotIn(MIME, data)
        self.assertIn("text/html", data)

    def test_wide_frames_and_other_objects_keep_plain_output(self):
        wide = pd.DataFrame({f"c{i}": [1] for i in range(60)})
        self.assertNotIn(MIME, self.bundle(wide))
        self.assertNotIn(MIME, self.bundle([1, 2, 3]))
        self.assertNotIn(MIME, self.bundle(pd.Series([1, 2])))



class VariableInspectTest(unittest.TestCase):
    NAMES = ("df", "s", "arr", "items", "text", "n", "big", "nan_value", "helper", "Thing")

    @classmethod
    def setUpClass(cls):
        cls.shell = InteractiveShell.instance()

    def setUp(self):
        for name in self.NAMES + ("secret_module", "_private"):
            self.shell.user_ns.pop(name, None)

    def inspect(self, name=None):
        """The bridge's path: define silently, then call as a user expression."""
        self.shell.run_cell(INSPECT_CODE, silent=True, store_history=False).raise_error()
        reply = self.shell.user_expressions({"r": "_rosetta_inspect(%r)" % (name,)})["r"]
        self.assertEqual(reply["status"], "ok", reply)
        return json.loads(ast.literal_eval(reply["data"]["text/plain"]))

    def test_lists_user_variables_only(self):
        self.shell.run_cell(
            "import math as secret_module\n"
            "def helper(): pass\n"
            "class Thing: pass\n"
            "_private = 1\n"
            "n = 3\n"
            "items = [1, 2]\n"
            "text = 'x' * 50\n"
        ).raise_error()
        result = self.inspect()
        names = [v["name"] for v in result["variables"]]
        self.assertEqual(names, sorted(names))
        for name in ("n", "items", "text"):
            self.assertIn(name, names)
        for hidden in (
            "secret_module", "helper", "Thing", "_private",
            "In", "Out", "get_ipython", "exit", "quit", "_rosetta_inspect",
        ):
            self.assertNotIn(hidden, names)
        summaries = {v["name"]: v["summary"] for v in result["variables"]}
        self.assertEqual(summaries["n"], "3")
        self.assertEqual(summaries["items"], "2 items")
        self.assertTrue(summaries["text"].startswith("50 chars: 'xxxx"))
        self.assertFalse(result["truncated"])

    def test_dataframe_detail_with_nulls_and_head(self):
        self.shell.user_ns["df"] = pd.DataFrame(
            {"region": ["a", None, "c"], "amount": [1.5, np.nan, 3.0]}
        )
        listing = {v["name"]: v for v in self.inspect()["variables"]}
        self.assertEqual(listing["df"]["type"], "DataFrame")
        self.assertEqual(listing["df"]["summary"], "3 rows \u00d7 2 cols")
        detail = self.inspect("df")
        self.assertEqual((detail["rows"], detail["cols"]), (3, 2))
        self.assertEqual(
            detail["columns"],
            [
                {"name": "region", "dtype": "object", "nulls": 1},
                {"name": "amount", "dtype": "float64", "nulls": 1},
            ],
        )
        self.assertEqual(detail["head"]["columns"], ["region", "amount"])
        self.assertEqual(detail["head"]["data"][1], [None, None])

    def test_series_array_and_other_values(self):
        self.shell.user_ns["s"] = pd.Series([1.0, 2.0], name="amount")
        self.shell.user_ns["arr"] = np.zeros((3, 4))
        self.shell.user_ns["big"] = {"k": "v" * 5000}
        listing = {v["name"]: v["summary"] for v in self.inspect()["variables"]}
        self.assertEqual(listing["s"], "2 values, float64")
        self.assertEqual(listing["arr"], "shape (3, 4), float64")
        series = self.inspect("s")
        self.assertEqual((series["dtype"], series["length"]), ("float64", 2))
        self.assertEqual(series["head"]["data"], [1.0, 2.0])
        self.assertEqual(self.inspect("arr")["shape"], [3, 4])
        self.assertEqual(len(self.inspect("big")["repr"]), 2000)

    def test_unknown_name(self):
        self.assertEqual(self.inspect("nope"), {"error": "No variable named 'nope'"})

    def test_output_is_json_for_nan_datetimes_and_big_ints(self):
        self.shell.user_ns["df"] = pd.DataFrame(
            {
                "f": [np.nan, np.inf],
                "big": [2**60, 1],
                "when": pd.to_datetime(["2020-01-01", None]),
            }
        )
        self.shell.user_ns["big"] = 2**70
        self.shell.user_ns["nan_value"] = float("nan")
        detail = self.inspect("df")
        json.dumps(detail, allow_nan=False)
        self.assertTrue(detail["head"]["data"][0][2].startswith("2020-01-01T00:00:00"))
        self.assertEqual(detail["head"]["data"][0][1], 2**60)
        listing = self.inspect()
        json.dumps(listing, allow_nan=False)
        summaries = {v["name"]: v["summary"] for v in listing["variables"]}
        self.assertEqual(summaries["big"], str(2**70))
        self.assertEqual(summaries["nan_value"], "nan")

    def test_survives_reset(self):
        self.shell.run_cell("%reset -f").raise_error()
        self.shell.user_ns["n"] = 1
        names = [v["name"] for v in self.inspect()["variables"]]
        self.assertIn("n", names)


if __name__ == "__main__":
    unittest.main()
