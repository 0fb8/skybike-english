// 音声の置き場所としての S3（infra/ の CDK で作るバケット）。CloudFront 経由で配信する。
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AudioStore } from "./store";

/** ファイル名にハッシュが入っていて中身は変わらないので、ブラウザ・CDN に 1 年キャッシュさせる */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export class S3Store implements AudioStore {
  readonly label: string;
  private client: S3Client;

  constructor(region: string, private bucket: string, private prefix: string) {
    // 応答が返らないまま止まらないよう待ち時間に上限を付け、一時的な失敗は SDK に再試行させる
    this.client = new S3Client({ region, maxAttempts: 5, requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 } });
    this.label = `s3://${bucket}/${prefix}/`;
  }

  async list() {
    const r = new Map<string, number>();
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${this.prefix}/`, ContinuationToken: token }));
      for (const o of res.Contents ?? []) if (o.Key) r.set(o.Key.slice(this.prefix.length + 1), o.Size ?? 0);
      token = res.NextContinuationToken;
    } while (token);
    return r;
  }

  async put(name: string, body: Uint8Array | string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `${this.prefix}/${name}`,
      Body: body,
      ContentType: name.endsWith(".mp3") ? "audio/mpeg" : "application/x-ndjson",
      CacheControl: CACHE_CONTROL,
    }));
  }

  async remove(names: string[]) {
    for (let i = 0; i < names.length; i += 1000) {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: names.slice(i, i + 1000).map((n) => ({ Key: `${this.prefix}/${n}` })) },
      }));
    }
  }
}
