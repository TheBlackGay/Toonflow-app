export default {
  id: "mockVideo",
  label: "Mock Video（本地占位）",
  version: "1.0.0",
  readme: "本地验收用的视频供应商。使用宿主 FFmpeg 生成测试视频，不调用外部模型服务。接入真实视频模型后可删除或停用。",
  rules: [],
  models: [
    {
      id: "mock-video",
      label: "Mock Video 480p",
      type: "video",
      mode: ["text"],
      durationResolutionMap: [
        { duration: [2, 4, 8], resolution: ["360p", "480p"] },
      ],
      audio: false,
    },
  ],
  async healthCheck() {
    return { reachable: true, models: ["mock-video"], message: "本地 Mock 视频供应商已就绪" };
  },
  async generateVideo(request: VideoRequest): Promise<MediaAsset[]> {
    return [await this.tool.mockVideo(request)];
  },
} satisfies ProviderDefinition;
