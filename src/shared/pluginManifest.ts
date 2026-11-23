// The runner's plugin manifest (plugins.json next to the local runner) is the
// only description of pipeline plugins Studio has: which plugins exist, the
// form each one shows in the pipeline designer (widgets, rules) and the tools
// it needs (requires). Nothing about a specific plugin is written in Studio.
//
// Parsing is lenient on purpose: a newer manifest may have fields, widget
// types or rule types this version does not know. Those are skipped (an
// unknown widget type is shown as a text input) instead of failing.

export const PLUGIN_WIDGET_TYPES = [
  'input',
  'textarea',
  'code',
  'number',
  'checkbox',
  'dropdown',
  'radio',
  'multiselect',
  'file',
  'directory',
  'key_value',
  'list',
] as const;

export type PluginWidgetType = (typeof PLUGIN_WIDGET_TYPES)[number];

export interface PluginWidgetOption {
  value: string;
  label: string;
}

export interface PluginCondition {
  key: string;
  equals: unknown;
}

export interface PluginWidget {
  /** The step's yaml key (the runner passes it upper-cased to the script). */
  key: string;
  type: PluginWidgetType;
  label: string;
  description?: string;
  required: boolean;
  /** Filled in for a new step; may hold macros (see expandMacros). */
  default?: unknown;
  placeholder?: string;
  /** Named, collapsible section of the form. */
  group?: string;
  visibleWhen?: PluginCondition;
  /** dropdown, radio, multiselect */
  options: PluginWidgetOption[];
  /** number */
  min?: number;
  max?: number;
  step?: number;
  /** code */
  language?: string;
  /** multiselect, list: joins the values into the one string saved. */
  separator: string;
}

export type PluginRuleType = 'at_least_one' | 'exactly_one' | 'required_if';

export interface PluginRule {
  type: PluginRuleType;
  keys: string[];
  message?: string;
  when?: PluginCondition;
}

export interface PluginRequirement {
  id: string;
  label: string;
  check: { command: string; args?: string[]; minVersion?: string };
  install: {
    type: 'auto' | 'manual';
    url?: string;
    method?: string;
    package?: string;
    downloads?: Record<string, string>;
    instructions?: Record<string, string[]>;
  };
}

export interface PluginDefinition {
  /** e.g. "dbt@v1" */
  id: string;
  label: string;
  description?: string;
  category: string;
  icon?: string;
  color?: string;
  /** false: existing steps are kept, the plugin is not offered for new ones. */
  addable: boolean;
  widgets: PluginWidget[];
  rules: PluginRule[];
  requires: PluginRequirement[];
}

export type StepParams = Record<string, unknown>;

/** Step keys that are not plugin parameters. */
export const RESERVED_STEP_KEYS = ['name', 'plugin', 'id', 'job_id'];

const DEFAULT_CATEGORY = 'Generic';
const DEFAULT_SEPARATOR = ',';

// The form of a plugin whose manifest entry has no widgets.
const GENERIC_WIDGETS: PluginWidget[] = [
  {
    key: 'command',
    type: 'textarea',
    label: 'Command',
    required: true,
    options: [],
    separator: DEFAULT_SEPARATOR,
  },
  {
    key: 'working_dir',
    type: 'directory',
    label: 'Working Dir',
    required: false,
    options: [],
    separator: DEFAULT_SEPARATOR,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const parseCondition = (value: unknown): PluginCondition | undefined => {
  if (!isRecord(value)) return undefined;
  const key = text(value.key);
  return key ? { key, equals: value.equals } : undefined;
};

const parseWidget = (value: unknown): PluginWidget | null => {
  if (!isRecord(value)) return null;
  const key = text(value.key);
  if (!key || RESERVED_STEP_KEYS.includes(key)) return null;
  const type = (PLUGIN_WIDGET_TYPES as readonly string[]).includes(
    String(value.type),
  )
    ? (value.type as PluginWidgetType)
    : 'input';
  const options = Array.isArray(value.options)
    ? value.options.flatMap((option): PluginWidgetOption[] => {
        if (typeof option === 'string') {
          return [{ value: option, label: option }];
        }
        if (!isRecord(option) || typeof option.value !== 'string') return [];
        return [
          { value: option.value, label: text(option.label) ?? option.value },
        ];
      })
    : [];
  return {
    key,
    type,
    label: text(value.label) ?? key,
    description: text(value.description),
    required: value.required === true,
    default: value.default,
    placeholder: text(value.placeholder),
    group: text(value.group),
    visibleWhen: parseCondition(value.visible_when),
    options,
    min: numberOrUndefined(value.min),
    max: numberOrUndefined(value.max),
    step: numberOrUndefined(value.step),
    language: text(value.language),
    separator:
      typeof value.separator === 'string' && value.separator
        ? value.separator
        : DEFAULT_SEPARATOR,
  };
};

const parseRule = (value: unknown): PluginRule | null => {
  if (!isRecord(value)) return null;
  const { type } = value;
  if (
    type !== 'at_least_one' &&
    type !== 'exactly_one' &&
    type !== 'required_if'
  ) {
    return null;
  }
  const keys = stringList(value.keys);
  const when = parseCondition(value.when);
  if (keys.length === 0 || (type === 'required_if' && !when)) return null;
  return { type, keys, message: text(value.message), when };
};

const parseRequirement = (value: unknown): PluginRequirement | null => {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const check = isRecord(value.check) ? value.check : {};
  const command = text(check.command);
  if (!id || !command) return null;
  const install = isRecord(value.install) ? value.install : {};
  const downloads = isRecord(install.downloads)
    ? Object.fromEntries(
        Object.entries(install.downloads).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : undefined;
  const instructions = isRecord(install.instructions)
    ? Object.fromEntries(
        Object.entries(install.instructions)
          .map(([os, steps]): [string, string[]] => [os, stringList(steps)])
          .filter(([, steps]) => steps.length > 0),
      )
    : undefined;
  return {
    id,
    label: text(value.label) ?? id,
    check: {
      command,
      args: Array.isArray(check.args) ? stringList(check.args) : undefined,
      minVersion: text(check.min_version),
    },
    install: {
      type: install.type === 'auto' ? 'auto' : 'manual',
      url: text(install.url),
      method: text(install.method),
      package: text(install.package),
      downloads,
      instructions,
    },
  };
};

const notNull = <T>(value: T | null): value is T => value !== null;

/** Reads the content of plugins.json. Anything unusable gives no plugins. */
export function parsePluginManifest(raw: unknown): PluginDefinition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry): PluginDefinition[] => {
    if (!isRecord(entry)) return [];
    const id = text(entry.name);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const widgets = Array.isArray(entry.widgets)
      ? entry.widgets.map(parseWidget).filter(notNull)
      : [];
    const uniqueWidgets = widgets.filter(
      (widget, index) =>
        widgets.findIndex((other) => other.key === widget.key) === index,
    );
    return [
      {
        id,
        label: text(entry.label) ?? id.split('@')[0],
        description: text(entry.description),
        category: text(entry.category) ?? DEFAULT_CATEGORY,
        icon: text(entry.icon),
        color:
          typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)
            ? entry.color
            : undefined,
        addable: entry.addable !== false,
        widgets: uniqueWidgets.length > 0 ? uniqueWidgets : GENERIC_WIDGETS,
        rules: Array.isArray(entry.rules)
          ? entry.rules.map(parseRule).filter(notNull)
          : [],
        requires: Array.isArray(entry.requires)
          ? entry.requires.map(parseRequirement).filter(notNull)
          : [],
      },
    ];
  });
}

export const isEmptyParam = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

const conditionHolds = (
  condition: PluginCondition,
  params: StepParams,
): boolean => String(params[condition.key] ?? '') === String(condition.equals);

export const isWidgetVisible = (
  widget: PluginWidget,
  params: StepParams,
): boolean => !widget.visibleWhen || conditionHolds(widget.visibleWhen, params);

export interface StepParamIssue {
  /** The parameter the issue is about; missing for a rule over several. */
  key?: string;
  message: string;
}

/**
 * What the designer and the pipeline authoring tools check before saving.
 * The runner checks nothing of this: a plugin's script decides what is valid
 * when the step runs.
 */
export function validateStepParams(
  plugin: PluginDefinition,
  params: StepParams,
): StepParamIssue[] {
  const issues: StepParamIssue[] = [];
  const labelOf = (key: string) =>
    plugin.widgets.find((widget) => widget.key === key)?.label ?? key;

  plugin.widgets.forEach((widget) => {
    if (
      widget.required &&
      isWidgetVisible(widget, params) &&
      isEmptyParam(params[widget.key])
    ) {
      issues.push({
        key: widget.key,
        message: `missing required field: ${widget.label}`,
      });
    }
  });

  plugin.rules.forEach((rule) => {
    const filled = rule.keys.filter((key) => !isEmptyParam(params[key]));
    const names = rule.keys.map(labelOf).join(', ');
    if (rule.type === 'at_least_one' && filled.length === 0) {
      issues.push({
        message: rule.message ?? `provide at least one of: ${names}`,
      });
    }
    if (rule.type === 'exactly_one' && filled.length !== 1) {
      issues.push({
        message: rule.message ?? `provide exactly one of: ${names}`,
      });
    }
    if (
      rule.type === 'required_if' &&
      rule.when &&
      conditionHolds(rule.when, params) &&
      filled.length < rule.keys.length
    ) {
      issues.push({
        message:
          rule.message ??
          `${names} required when ${labelOf(rule.when.key)} is ${String(
            rule.when.equals,
          )}`,
      });
    }
  });

  return issues;
}

/**
 * Values a widget default may refer to, e.g. { 'project.rosetta_dir':
 * 'rosetta' }. Replaced when the value is put into a step, so the pipeline
 * file holds the value and the runner never sees a macro. A macro that is
 * unknown or has no value becomes empty.
 */
export type MacroContext = Record<string, string | undefined>;

export const expandMacros = (value: string, context: MacroContext): string =>
  value.replace(/\$\{([^}]*)\}/g, (_match, name: string) => {
    return context[name.trim()] ?? '';
  });

/** The parameters of a new step: every widget's default, macros replaced. */
export function defaultStepParams(
  plugin: PluginDefinition,
  context: MacroContext = {},
): StepParams {
  const params: StepParams = {};
  plugin.widgets.forEach((widget) => {
    const value =
      typeof widget.default === 'string'
        ? expandMacros(widget.default, context)
        : widget.default;
    if (!isEmptyParam(value)) params[widget.key] = value;
  });
  return params;
}

export interface RequirementWithPlugins extends PluginRequirement {
  /** Ids of the plugins that need this tool. */
  plugins: string[];
}

/** Every tool the plugins need, once each (a tool is identified by its id). */
export function collectRequirements(
  plugins: PluginDefinition[],
): RequirementWithPlugins[] {
  const byId = new Map<string, RequirementWithPlugins>();
  plugins.forEach((plugin) => {
    plugin.requires.forEach((requirement) => {
      const known = byId.get(requirement.id);
      if (known) known.plugins.push(plugin.id);
      else byId.set(requirement.id, { ...requirement, plugins: [plugin.id] });
    });
  });
  return Array.from(byId.values());
}
