import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  Linking,
  Platform,
} from 'react-native';
import {privacyAgreed, setPrivacyAgreed} from '../services/privacyConsent';
import {initDeviceId, getDeviceId} from '../services/device';
import {registerAccount} from '../services/account';

/**
 * 应用商店合规：首次启动先弹《用户协议》《隐私政策》，
 * 同意后才允许设备号初始化 / 静默注册；不同意则退出。
 */
export default function PrivacyHost({onReady, navigationRef}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await privacyAgreed();
      if (!alive) return;
      if (ok) {
        setReady(true);
        onReady && onReady();
      } else {
        setOpen(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [onReady]);

  const exitApp = () => {
    setPrivacyAgreed(false);
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    } else {
      setOpen(false);
    }
  };

  const agree = async () => {
    await setPrivacyAgreed(true);
    try {
      await initDeviceId();
      registerAccount(getDeviceId(), 'student').catch(() => {});
    } catch (_) {}
    setOpen(false);
    setReady(true);
    onReady && onReady();
  };

  const openDoc = path => {
    Linking.openURL(`https://tutujiaolian.com/${path}`).catch(() => {
      try {
        navigationRef?.current?.navigate('Legal');
      } catch (_) {}
    });
  };

  if (ready && !open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={exitApp}>
      <View style={ui.mask}>
        <View style={ui.card}>
          <Text style={ui.title}>个人信息保护提示</Text>
          <Text style={ui.body}>
            我们非常重视您的个人信息与隐私保护。请在使用兔兔教练前仔细阅读
            <Text style={ui.link} onPress={() => openDoc('terms.html')}>
              《用户协议》
            </Text>
            和
            <Text style={ui.link} onPress={() => openDoc('privacy.html')}>
              《隐私政策》
            </Text>
            。点击「同意」即表示您已阅读并同意上述协议；在此之前，本应用不会读取设备标识或上传账号信息。不同意将无法继续使用本应用。
          </Text>
          <TouchableOpacity style={ui.btnPrimary} onPress={agree} accessibilityLabel="同意">
            <Text style={ui.btnPrimaryText}>同意</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ui.btnGhost} onPress={exitApp} accessibilityLabel="不同意">
            <Text style={ui.btnGhostText}>不同意</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ui = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: '#444',
    marginBottom: 18,
  },
  link: {color: '#2F6BFF'},
  btnPrimary: {
    backgroundColor: '#7B5CFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  btnGhost: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGhostText: {color: '#333', fontSize: 16},
});
