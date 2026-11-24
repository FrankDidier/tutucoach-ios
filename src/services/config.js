// 兔兔教练 · 服务端配置（iOS / Android 共用）。
// 与 Android 原生端 (TutuCoach) 指向同一后端，账号 / 练习 / 教师统计 / AI 总结
// 全部复用已上线接口，iOS 端无需重建后端。
export const BASE_URL = 'https://tutujiaolian.com';

// 听音辨谱。true 时才上传耳印。已安装的旧包不上传，不受影响。
// 谱照片没有音高，不能逐音对谱；只能和已经听会的段落比。
export const EAR_LISTEN = true;

// 微信开放平台（与 Android 端一致；密钥仅在服务端）。
export const WECHAT_APP_ID = 'wx4df6edf68f7bf8ba';
export const WECHAT_UNIVERSAL_LINK = 'https://tutujiaolian.com/app/'; // iOS 必填，待开放平台登记
