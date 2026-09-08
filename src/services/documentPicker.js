let DocumentPicker = null;
let types = {};

try {
  // eslint-disable-next-line global-require
  const mod = require('react-native-document-picker');
  DocumentPicker = mod.default || mod;
  types = mod.types || {};
} catch (e) {
  DocumentPicker = null;
}

export async function pickPdf() {
  if (!DocumentPicker || !DocumentPicker.pickSingle) {
    return {error: 'no_module'};
  }
  try {
    const file = await DocumentPicker.pickSingle({
      type: [types.pdf || 'application/pdf'],
      copyTo: 'cachesDirectory',
      presentationStyle: 'fullScreen',
    });
    return {
      uri: file.fileCopyUri || file.uri,
      name: file.name || 'score.pdf',
      type: file.type || 'application/pdf',
    };
  } catch (e) {
    const cancelled =
      (DocumentPicker.isCancel && DocumentPicker.isCancel(e)) ||
      e?.code === 'DOCUMENT_PICKER_CANCELED';
    return cancelled ? {cancelled: true} : {error: e?.message || 'pick_failed'};
  }
}

export default {pickPdf};
