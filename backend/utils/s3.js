const { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Readable } = require("stream");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadToS3 = async (file, folder = "uploads") => {
  const key = `${folder}/${Date.now()}-${file.originalname}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const getS3KeyFromStoragePath = (storagePath = "") => {
  const value = String(storagePath || "").trim();

  if (!value) {
    return "";
  }

  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, "");
  }

  try {
    const parsedUrl = new URL(value);
    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  } catch (error) {
    return "";
  }
};

const getS3ObjectStream = async (storagePath) => {
  const key = getS3KeyFromStoragePath(storagePath);

  if (!key) {
    throw new Error("S3 object key is required");
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    })
  );

  if (response.Body?.pipe) {
    return response.Body;
  }

  if (response.Body) {
    return Readable.fromWeb(response.Body);
  }

  throw new Error("S3 object body is empty");
};

const deleteS3Object = async (storagePath) => {
  const key = getS3KeyFromStoragePath(storagePath);
  if (!key) return;
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
};

const listS3Objects = async (prefix = "") => {
  const objects = [];
  let ContinuationToken;
  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      Prefix: prefix,
      ContinuationToken,
    }));
    objects.push(...(response.Contents || []));
    ContinuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
};

module.exports = { getS3ObjectStream, uploadToS3, deleteS3Object, listS3Objects, getS3KeyFromStoragePath };
