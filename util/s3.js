const { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

exports.s3Upload = async (filePath, fileName, mimeType, folder = "client1") => {
  const fileContent = fs.readFileSync(filePath);
  const key = `${folder}/${Date.now()}-${fileName.replace(/\s+/g, "_")}`;

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: mimeType,
  };

  await s3Client.send(new PutObjectCommand(params));
  return { key };
};

exports.generateSignedUrl = async (key, expiresIn = 300) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return await getSignedUrl(s3Client, command, { expiresIn });
};

exports.s3Delete = async (key) => {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
};