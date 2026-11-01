import { App } from "aws-cdk-lib";
import { AudioStack } from "../lib/audio-stack";

const app = new App();
new AudioStack(app, "SkybikeEnglishAudio", {
  // Polly の生成エンジン（generative）が使えるリージョン。config.yaml の speech.tts.region と合わせる
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  githubRepo: app.node.getContext("githubRepo"),
  githubOidcProviderArn: app.node.tryGetContext("githubOidcProviderArn") || undefined,
});
