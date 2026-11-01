// 例文の音声の置き場所と、CI（GitHub Actions）が音声を生成するための IAM ロール。
//   S3（非公開）─OAC→ CloudFront ─HTTPS→ ブラウザ（GitHub Pages のページから再生）
//   GitHub Actions ─OIDC→ IAM ロール ─→ Polly で生成して S3 に置く
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/** 音声を置くキーの先頭（scripts/tts/jobs.ts の AUDIO_DIR と同じ） */
const AUDIO_PREFIX = "audio";
const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";

export interface AudioStackProps extends StackProps {
  /** "<owner>/<repo>"。このリポジトリの main ブランチの Actions だけがロールを使える */
  githubRepo: string;
  /**
   * GitHub の OIDC トークンの sub の先頭（"ref:..." の前まで）。リポジトリが ID 入りの形式
   * （immutable subject。例: "repo:<owner>@<owner_id>/<repo>@<repo_id>"）のときに書く。
   * 確かめ方: gh api repos/<owner>/<repo>/actions/oidc/customization/sub の sub_claim_prefix
   * 省略すると従来の形式 "repo:<owner>/<repo>"
   */
  githubSubjectPrefix?: string;
  /** アカウントに GitHub の OIDC プロバイダが既にあればその ARN（1 アカウントに 1 つしか作れないため） */
  githubOidcProviderArn?: string;
}

export class AudioStack extends Stack {
  constructor(scope: Construct, id: string, props: AudioStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "Audio", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // スタックを消しても音声は残す（作り直すと Polly の料金がかかるため）
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const cdn = new cloudfront.Distribution(this, "Cdn", {
      comment: "skybike-english audio",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // ファイル名にハッシュが入っていて中身は変わらないので、長くキャッシュする
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // ゲームは別のドメイン（GitHub Pages）から fetch で先読みするので CORS を許可する（音声は公開物）
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      },
      // 北米・欧州・アジア（日本を含む）
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    const provider = props.githubOidcProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, "GithubOidc", props.githubOidcProviderArn)
      : new iam.OidcProviderNative(this, "GithubOidc", { url: GITHUB_OIDC_URL, clientIds: ["sts.amazonaws.com"] });

    const role = new iam.Role(this, "TtsRole", {
      description: `GitHub Actions (${props.githubRepo} main): generate audio with Polly and upload it to S3`, // IAM の説明は ASCII のみ
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `${props.githubSubjectPrefix ?? `repo:${props.githubRepo}`}:ref:refs/heads/main`,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });
    role.addToPolicy(new iam.PolicyStatement({ actions: ["polly:SynthesizeSpeech"], resources: ["*"] }));
    // 一覧と追加だけ。削除（npm run tts -- --prune）は CI ではなく、手元から自分の権限で行う
    bucket.grantRead(role, `${AUDIO_PREFIX}/*`);
    bucket.grantPut(role, `${AUDIO_PREFIX}/*`);

    new CfnOutput(this, "BucketName", { value: bucket.bucketName, description: "config.yaml の speech.tts.storage.bucket" });
    new CfnOutput(this, "BaseUrl", { value: `https://${cdn.distributionDomainName}`, description: "config.yaml の speech.tts.storage.baseUrl" });
    new CfnOutput(this, "TtsRoleArn", { value: role.roleArn, description: "GitHub のリポジトリ変数 AWS_TTS_ROLE_ARN" });
  }
}
