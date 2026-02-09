# Object stores ai context

---
title: S3 · Cloudflare R2 docs
description: Use R2 with S3-compatible SDKs like boto3 and the AWS SDK.
lastUpdated: 2026-01-26T20:24:24.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/r2/get-started/s3/
  md: https://developers.cloudflare.com/r2/get-started/s3/index.md
---

R2 provides support for a [S3-compatible API](https://developers.cloudflare.com/r2/api/s3/api/), which means you can use any S3 SDK, library, or tool to interact with your buckets. If you have existing code that works with S3, you can use it with R2 by changing the endpoint URL.

## 1. Create a bucket

A bucket stores your objects in R2. To create a new R2 bucket:

* Wrangler CLI

  1. Log in to your Cloudflare account:

     ```sh
     npx wrangler login
     ```

  2. Create a bucket named `my-bucket`:

     ```sh
     npx wrangler r2 bucket create my-bucket
     ```

     If prompted, select the account you want to create the bucket in.

  3. Verify the bucket was created:

     ```sh
     npx wrangler r2 bucket list
     ```

* Dashboard

  1. In the Cloudflare Dashboard, go to **R2 object storage**.

     [Go to **Overview**](https://dash.cloudflare.com/?to=/:account/r2/overview)

  2. Select **Create bucket**.

  3. Enter a name for your bucket.

  4. Select a [location](https://developers.cloudflare.com/r2/reference/data-location) for your bucket and a [default storage class](https://developers.cloudflare.com/r2/buckets/storage-classes/).

  5. Select **Create bucket**.

## 2. Generate API credentials

To use the S3 API, you need to generate [credentials](https://developers.cloudflare.com/r2/api/tokens/) and get an Access Key ID and Secret Access Key:

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Select **Storage & databases > R2 > Overview**.
3. Select **Manage** in API Tokens.
4. Select **Create Account API token** or **Create User API token**
5. Choose **Object Read & Write** permission and **Apply to specific buckets only** to select the buckets you want to access.
6. Select **Create API Token**.
7. Copy the **Access Key ID** and **Secret Access Key**. Store these securely as you cannot view the secret again.

You also need your S3 API endpoint URL which you can find at the bottom of the Create API Token confirmation page once you have created your token, or on the R2 Overview page:

```txt
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

## 3. Use an AWS SDK

The following examples show how to use Python and JavaScript SDKs. For other languages, refer to [S3-compatible SDK examples](https://developers.cloudflare.com/r2/examples/aws/) for [Go](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-go/), [Java](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-java/), [PHP](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-php/), [Ruby](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-ruby/), and [Rust](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-rust/).

* Python (boto3)

  1. Install [boto3](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html):

     ```sh
     pip install boto3
     ```

  2. Create a test file to upload:

     ```sh
     echo 'Hello, R2!' > myfile.txt
     ```

  3. Use your credentials to create an S3 client and interact with your bucket:

     ```python
     import boto3


     s3 = boto3.client(
         service_name='s3',
         # Provide your R2 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
         endpoint_url='https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
         # Provide your R2 Access Key ID and Secret Access Key
         aws_access_key_id='<ACCESS_KEY_ID>',
         aws_secret_access_key='<SECRET_ACCESS_KEY>',
         region_name='auto',  # Required by boto3, not used by R2
     )


     # Upload a file
     s3.upload_file('myfile.txt', 'my-bucket', 'myfile.txt')
     print('Uploaded myfile.txt')


     # Download a file
     s3.download_file('my-bucket', 'myfile.txt', 'downloaded.txt')
     print('Downloaded to downloaded.txt')


     # List objects
     response = s3.list_objects_v2(Bucket='my-bucket')
     for obj in response.get('Contents', []):
         print(f"Object: {obj['Key']}")
     ```

  4. Save this as `example.py` and run it:

     ```sh
     python example.py
     ```

     ```sh
     Uploaded myfile.txt
     Downloaded to downloaded.txt
     Object: myfile.txt
     ```

  Refer to [boto3 examples](https://developers.cloudflare.com/r2/examples/aws/boto3/) for more operations.

* JavaScript

  1. Install the [@aws-sdk/client-s3](https://www.npmjs.com/package/@aws-sdk/client-s3) package:

     ```sh
     npm install @aws-sdk/client-s3
     ```

  2. Use your credentials to create an S3 client and interact with your bucket:

     ```js
     import {
       S3Client,
       PutObjectCommand,
       GetObjectCommand,
       ListObjectsV2Command,
     } from "@aws-sdk/client-s3";


     const s3 = new S3Client({
       region: "auto", // Required by AWS SDK, not used by R2
       // Provide your R2 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
       endpoint: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
       credentials: {
         // Provide your R2 Access Key ID and Secret Access Key
         accessKeyId: "<ACCESS_KEY_ID>",
         secretAccessKey: "<SECRET_ACCESS_KEY>",
       },
     });


     // Upload a file
     await s3.send(
       new PutObjectCommand({
         Bucket: "my-bucket",
         Key: "myfile.txt",
         Body: "Hello, R2!",
       }),
     );
     console.log("Uploaded myfile.txt");


     // Download a file
     const response = await s3.send(
       new GetObjectCommand({
         Bucket: "my-bucket",
         Key: "myfile.txt",
       }),
     );
     const content = await response.Body.transformToString();
     console.log("Downloaded:", content);


     // List objects
     const list = await s3.send(
       new ListObjectsV2Command({
         Bucket: "my-bucket",
       }),
     );
     console.log(
       "Objects:",
       list.Contents.map((obj) => obj.Key),
     );
     ```

  3. Save this as `example.mjs` and run it:

     ```sh
     node example.mjs
     ```

     ```sh
     Uploaded myfile.txt
     Downloaded: Hello, R2!
     Objects: [ 'myfile.txt' ]
     ```

  Refer to [AWS SDK for JavaScript examples](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) for more operations.

## Next steps

[Presigned URLs ](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)Generate temporary URLs for private object access.

[Public buckets ](https://developers.cloudflare.com/r2/buckets/public-buckets/)Serve files directly over HTTP with a public bucket.

[CORS ](https://developers.cloudflare.com/r2/buckets/cors/)Configure CORS for browser-based uploads.

[Object lifecycles ](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)Set up lifecycle rules to automatically delete old objects.

---------------

How to Call the S3-Compatible API
Call the Backblaze B2 Cloud Storage S3-Compatible API to instantly plug into the Backblaze B2 service.

For all of the Backblaze API operations and their corresponding documentation, see API Documentation.
Endpoints
The following example shows the format for endpoints for the Backblaze B2 Cloud Storage S3-Compatible API:

https://s3.<region>.backblazeb2.com
The Backblaze B2 S3-Compatible API endpoints accept connections only over HTTPS. Non-secure connections are rejected. The AWS SDKs and most integrations require only an endpoint URL like the above (without the bucket name included).

If you make the HTTP calls directly, the Backblaze B2 S3-Compatible API supports specifying the bucket name in the hostname of the URL or in the path section of the URL. The following URLs are both valid examples of an endpoint calling a bucket:

https://bucketname.s3.us-east-005.backblazeb2.com
https://s3.us-east-005.backblazeb2.com/bucketname
Authentication
The S3-Compatible API supports only v4 signatures for authentication, and v2 signatures are not supported at this time. To learn more about S3 authentication, see this article.

Supported Calls
The S3-Compatible API returns calls in the same way that the AWS S3 API does. This may vary slightly from AWS S3 API documentation. The following call are supported in the S3-Compatible API:

Abort Multipart Upload (DELETE)
Complete Multipart Upload (POST)
Copy Object (PUT)
Create Bucket (PUT)
Create Multipart Upload (POST)
Delete Bucket
Delete Bucket Cors
Delete Bucket Encryption
Delete Object
Delete Objects (POST)
Get Bucket ACL
Get Bucket Cors
Get Bucket Encryption
Get Bucket Location
Get Bucket Versioning
Get Object
Get Object ACL
Get Object Legal Hold
Get Object Lock Configuration
Get Object Retention
Head Bucket
Head Object
List Buckets (GET)
List Multipart Uploads (GET)
List Object Versions (GET)
List Objects (GET)
List Objects V2 (GET)
List Parts (GET)
Put Bucket ACL
Put Bucket Cors
Put Bucket Encryption
Put Object
Put Object ACL
Put Object Legal Hold
Put Object Lock Configuration
Put Object Retention
Upload Part (PUT)
Upload Part Copy (PUT)
Successive Calls
When you upload multiple versions of the same file within the same second, the possibility exists that the processing of these versions may not be in order. Backblaze recommends that you delay uploads of multiple versions of the same file by at least one second to avoid this situation.

Similarly, when you hide a file within the same second as you upload that file, it is possible that the file may not actually be hidden. To avoid such a situation, please delay such calls on the same file by at least one second.

-------

https://docs.rustfs.com/developer/sdk/javascript.html

JavaScript SDK Guide (Node.js)
I. Overview
RustFS is S3-compatible and works with the official AWS SDK for JavaScript (v3). This guide will show you how to use JS to connect to RustFS and perform common object storage operations.

II. Prerequisites
2.1 SDK Installation
Install the required AWS SDK v3 modules with NPM:


npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
2.2 Example Configuration
Assume the RustFS instance is deployed as follows:


Endpoint: http://192.168.1.100:9000
Access Key: rustfsadmin
Secret Key: rustfssecret
III. Initializing the Client

import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const s3 = new S3Client({
 endpoint: "http://192.168.1.100:9000", // RustFS endpoint
 region: "us-east-1", // Any value is accepted
 credentials: {
 accessKeyId: "rustfsadmin",
 secretAccessKey: "rustfssecret",
 },
 forcePathStyle: true, // Must be enabled for RustFS compatibility
 requestHandler: new NodeHttpHandler({
 connectionTimeout: 3000,
 socketTimeout: 5000,
 }),
});
IV. Basic Operations
4.1 Create Bucket

import { CreateBucketCommand } from "@aws-sdk/client-s3";

await s3.send(new CreateBucketCommand({ Bucket: "my-bucket" }));
console.log("Bucket created");
4.2 Upload Object

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

const data = readFileSync("hello.txt");

await s3.send(
 new PutObjectCommand({
 Bucket: "my-bucket",
 Key: "hello.txt",
 Body: data,
 })
);

console.log("File uploaded");
4.3 Download Object

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFile } from "fs/promises";

const response = await s3.send(
 new GetObjectCommand({ Bucket: "my-bucket", Key: "hello.txt" })
);

const streamToBuffer = async (stream) => {
 const chunks = [];
 for await (const chunk of stream) chunks.push(chunk);
 return Buffer.concat(chunks);
};

const buffer = await streamToBuffer(response.Body);
await writeFile("downloaded.txt", buffer);

console.log("File downloaded");
4.4 List Objects

import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const res = await s3.send(new ListObjectsV2Command({ Bucket: "my-bucket" }));
res.Contents?.forEach((obj) => console.log(`${obj.Key} (${obj.Size} bytes)`));
4.5 Delete Object

import { DeleteObjectCommand } from "@aws-sdk/client-s3";

await s3.send(new DeleteObjectCommand({ Bucket: "my-bucket", Key: "hello.txt" }));
console.log("File deleted");
V. Advanced Features
5.1 Generate Presigned URLs
Allows frontend or third parties to use temporary links for uploading/downloading files

Download (GET)

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const url = await getSignedUrl(
 s3,
 new GetObjectCommand({ Bucket: "my-bucket", Key: "hello.txt" }),
 { expiresIn: 600 }
);

console.log("Presigned GET URL:", url);
Upload (PUT)

import { PutObjectCommand } from "@aws-sdk/client-s3";

const url = await getSignedUrl(
 s3,
 new PutObjectCommand({ Bucket: "my-bucket", Key: "upload.txt" }),
 { expiresIn: 600 }
);

console.log("Presigned PUT URL:", url);
5.2 Multipart Upload

import {
 CreateMultipartUploadCommand,
 UploadPartCommand,
 CompleteMultipartUploadCommand,
 AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { createReadStream } from "fs";

const bucket = "my-bucket";
const key = "large-file.zip";
const filePath = "./large-file.zip";
const partSize = 5 * 1024 * 1024; // 5 MB

// 1. Create upload task
const createRes = await s3.send(
 new CreateMultipartUploadCommand({ Bucket: bucket, Key: key })
);
const uploadId = createRes.UploadId;

// 2. Segmented upload
import { statSync, openSync, readSync, closeSync } from "fs";

const fileSize = statSync(filePath).size;
const fd = openSync(filePath, "r");
const parts = [];

for (let partNumber = 1, offset = 0; offset < fileSize; partNumber++) {
 const buffer = Buffer.alloc(Math.min(partSize, fileSize - offset));
 readSync(fd, buffer, 0, buffer.length, offset);

 const uploadPartRes = await s3.send(
 new UploadPartCommand({
 Bucket: bucket,
 Key: key,
 UploadId: uploadId,
 PartNumber: partNumber,
 Body: buffer,
 })
 );

 parts.push({ ETag: uploadPartRes.ETag, PartNumber: partNumber });
 offset += partSize;
}

closeSync(fd);

// 3. Complete upload
await s3.send(
 new CompleteMultipartUploadCommand({
 Bucket: bucket,
 Key: key,
 UploadId: uploadId,
 MultipartUpload: { Parts: parts },
 })
);

console.log("Multipart upload completed");
VI. Common Issues and Notes
Problem	Cause	Solution
SignatureDoesNotMatch	Wrong signature version	JS SDK v3 uses v4 by default, ensure RustFS supports v4
EndpointConnectionError	Endpoint address misconfigured or not started	Check if RustFS address is accessible
NoSuchKey	File does not exist	Check if Key is spelled correctly
InvalidAccessKeyId / Secret	Credentials misconfigured	Check accessKeyId / secretAccessKey configuration
Upload failure (path issue)	Path-style not enabled	Set forcePathStyle: true
VII. Appendix: Frontend Upload Adaptation
Using presigned URLs allows browsers to upload files directly without passing AccessKey.

Frontend (HTML+JS) upload example:


<input type="file" id="fileInput" />
<script>
 document.getElementById("fileInput").addEventListener("change", async (e) => {
 const file = e.target.files[0];
 const url = await fetch("/api/presigned-put-url?key=" + file.name).then((r) =>
 r.text()
 );

 const res = await fetch(url, {
 method: "PUT",
 body: file,
 });

 if (res.ok) alert("Uploaded!");
 });
</script>
Edit this page on GitHub
