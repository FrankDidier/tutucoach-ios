// 兔兔教练 · 服务端配置（iOS / Android 共用）。
// 与 Android 原生端 (TutuCoach) 指向同一后端，账号 / 练习 / 教师统计 / AI 总结
// 全部复用已上线接口，iOS 端无需重建后端。
export const BASE_URL = 'https://tutujiaolian.com';

// 微信开放平台（与 Android 端一致；密钥仅在服务端）。
export const WECHAT_APP_ID = 'wx4df6edf68f7bf8ba';
export const WECHAT_UNIVERSAL_LINK = 'https://tutujiaolian.com/app/'; // iOS 必填，待开放平台登记
