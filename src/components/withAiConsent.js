import React, {useEffect, useState} from 'react';
import {Alert, View} from 'react-native';
import {ensureAiConsent} from '../services/aiConsent';

// 会把数据发给第三方 AI 的页面：用户同意之前不挂载页面（不开麦、不请求服务器）。
export default function withAiConsent(Screen) {
  function Gated(props) {
    const [ok, setOk] = useState(false);
    useEffect(() => {
      let alive = true;
      ensureAiConsent().then(agreed => {
        if (!alive) return;
        if (agreed) {
          setOk(true);
          return;
        }
        Alert.alert('需要你的同意', '这个功能要用到第三方 AI 服务。你可以随时在「我的 → AI 数据授权」里重新选择。');
        const nav = props.navigation;
        if (nav && nav.canGoBack && nav.canGoBack()) nav.goBack();
        else if (nav) nav.reset({index: 0, routes: [{name: 'MainTabs'}]});
      });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!ok) return <View style={{flex: 1, backgroundColor: '#111'}} />;
    return <Screen {...props} />;
  }
  Gated.displayName = `withAiConsent(${Screen.displayName || Screen.name || 'Screen'})`;
  return Gated;
}
