import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import {setItem} from '../services/storage';

const {width} = Dimensions.get('window');

// 与安卓 activity_guide / strings.xml 的 4 页引导 1:1。
const PAGES = [
  {
    icon: Images.rabbitMascot,
    title: '欢迎使用兔兔教练',
    desc: '智能钢琴手型监测APP\n帮助琴童纠正弹琴手型',
  },
  {
    icon: Images.photoTemplate,
    title: '设置手型模板',
    desc: '点击左上角相机图标\n拍照或从相册选取正确手型\n系统会自动识别左右手',
  },
  {
    icon: Images.menuAiSettings,
    title: '调整检测参数',
    desc:
      '点击齿轮图标调整:\n• 阈值 - 角度灵敏度\n• 周期 - 报警延迟秒数\n• 占比 - 匹配正确率门槛',
  },
  {
    icon: Images.rabbitMascot,
    title: '开始练习',
    desc:
      '点击「开始」按钮启动监测\n手型偏差超过设定值时自动报警\nAI陪练版可获得实时语音纠错',
  },
];

const GuideScreen = ({navigation, route}) => {
  const forceShow = route?.params?.forceShow;
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);

  const finish = async () => {
    await setItem('guide_shown', '1');
    if (forceShow) {
      navigation.goBack();
    } else {
      navigation.replace('MainTabs');
    }
  };

  const goNext = () => {
    if (page >= PAGES.length - 1) {
      finish();
      return;
    }
    const next = page + 1;
    setPage(next);
    scrollRef.current?.scrollTo({x: next * width, animated: true});
  };

  const onScroll = e => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== page) setPage(idx);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={finish} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={styles.skip}>跳过</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.pager}>
        {PAGES.map((p, i) => (
          <View key={i} style={[styles.page, {width}]}>
            <Image source={p.icon} style={styles.icon} resizeMode="contain" />
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.desc}>{p.desc}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === page ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextBtn} activeOpacity={0.88} onPress={goNext}>
          <Text style={styles.nextText}>
            {page >= PAGES.length - 1 ? '开始使用' : '下一步'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  topBar: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  skip: {fontSize: 15, color: Colors.textSecondary},
  pager: {flex: 1},
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  icon: {width: 180, height: 180, marginBottom: 36},
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 18,
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    lineHeight: 26,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dot: {width: 10, height: 10, borderRadius: 5, marginHorizontal: 5},
  dotActive: {backgroundColor: Colors.pinkPrimary},
  dotInactive: {backgroundColor: '#F3C6D2'},
  footer: {paddingHorizontal: 32, paddingBottom: 28},
  nextBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {color: '#fff', fontSize: 17, fontWeight: '700'},
});

export default GuideScreen;
