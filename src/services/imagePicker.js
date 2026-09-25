// 相册选图封装 —— 对应安卓 ActivityResultContracts.GetContent("image/*")。
// 懒加载 react-native-image-picker。返回选中的本地 uri 字符串，或 null（取消/失败）。
let picker = null;
try {
  // eslint-disable-next-line global-require
  picker = require('react-native-image-picker');
} catch (e) {
  picker = null;
}

function assetToFile(asset, fallbackName) {
  if (!asset?.uri && !asset?.base64) return null;
  const type = asset.type || 'image/jpeg';
  const out = {
    uri: asset.uri || '',
    type,
    name: asset.fileName || fallbackName || `score_${Date.now()}.jpg`,
  };
  // 头像这类要长期存着的图，存 data URI：App 更新后沙盒目录会换名字，
  // 存 file:// 路径的话下次打开就找不到图了。
  // 乐谱上传也靠 base64 兜底：iOS 偶发 ph://，FormData 读不到会超时。
  if (asset.base64) {
    out.base64 = asset.base64;
    out.dataUri = `data:${type};base64,${asset.base64}`;
    // 顺序页缩略图：高清 dataUri 会让 Image 发白；另存一份短预览（截断 JPEG 不可行，
    // 这里用「足够小才当 preview」——真正预览优先走 file://，见 pendingPreviewUri）
    if (asset.base64.length < 260000) {
      out.previewUri = out.dataUri;
    }
  }
  return out;
}

// 相册选图。默认按头像场景压到 ~512；手型模版需要更高清晰度，可传 opts 覆盖。
// opts.selectionLimit: 0=不限（多选），1=单选（默认）
export function pickFromGallery(opts = {}) {
  return new Promise(resolve => {
    if (!picker || !picker.launchImageLibrary) {
      resolve({error: 'no_module'});
      return;
    }
    const limit = opts.selectionLimit == null ? 1 : opts.selectionLimit;
    picker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: limit,
        maxWidth: opts.maxWidth || 512,
        maxHeight: opts.maxHeight || 512,
        quality: opts.quality || 0.88,
        includeBase64: !!opts.base64,
      },
      response => {
        if (response.didCancel) {
          resolve({cancelled: true});
          return;
        }
        if (response.errorCode) {
          resolve({error: response.errorCode});
          return;
        }
        const assets = response.assets || [];
        if (!assets.length) {
          resolve({uri: null});
          return;
        }
        if (limit !== 1 && assets.length > 1) {
          resolve({
            files: assets
              .map((a, i) => assetToFile(a, `score_${Date.now()}_${i}.jpg`))
              .filter(Boolean),
          });
          return;
        }
        const file = assetToFile(assets[0]);
        resolve(file || {uri: null});
      },
    );
  });
}

// 拍照。默认较高分辨率；乐谱可传更大 opts。
export function captureFromCamera(opts = {}) {
  return new Promise(resolve => {
    if (!picker || !picker.launchCamera) {
      resolve({error: 'no_module'});
      return;
    }
    picker.launchCamera(
      {
        mediaType: 'photo',
        saveToPhotos: false,
        cameraType: 'back',
        maxWidth: opts.maxWidth || 1280,
        maxHeight: opts.maxHeight || 1280,
        quality: opts.quality || 0.9,
        includeBase64: !!opts.base64,
      },
      response => {
        if (response.didCancel) {
          resolve({cancelled: true});
          return;
        }
        if (response.errorCode) {
          resolve({error: response.errorCode});
          return;
        }
        const asset =
          response.assets && response.assets.length ? response.assets[0] : null;
        const file = assetToFile(asset);
        resolve(file || {uri: null});
      },
    );
  });
}

export function isAvailable() {
  return !!(picker && picker.launchImageLibrary);
}

export default {pickFromGallery, captureFromCamera, isAvailable};
