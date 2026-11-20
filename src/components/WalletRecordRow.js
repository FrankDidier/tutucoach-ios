// 蓝湖 充值记录 / 消费明细 / 收入明细 / 提现记录 的一行：345×70 r10，间距 15。
// 图标 44 (15,13)；标题 16/600 lh22（有图标时 x69，否则 x15）；时间 12 lh17 (+1, 下 3)；
// 右侧金额 16/600 右对齐，或状态标签 48×22 r4 字 11（已到账 #00C777、审核中 #FF355F、处理中 #FF9519）。
import React from 'react';
import {View, Text, Image, StyleSheet, Dimensions} from 'react-native';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

const BADGE = {
  paid: '#00C777',
  review: '#FF355F',
  pending: '#FF9519',
  rejected: '#979797',
};

function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export default function WalletRecordRow({
  dark,
  icon,
  title,
  time,
  amount,
  badge,
  side,
  timeColor,
}) {
  const ink = dark ? '#FFFFFF' : '#261216';
  const color = badge ? BADGE[badge.kind] || BADGE.pending : null;
  return (
    <View style={[styles.row, {backgroundColor: dark ? '#040428' : '#FFFFFF'}]}>
      {icon ? <Image source={icon} style={styles.icon} /> : null}
      <View style={styles.mid}>
        <Text style={[styles.title, {color: ink}]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[
            styles.time,
            {color: timeColor || (dark ? '#A1A1B4' : '#A6A6A6')},
          ]}>
          {time}
        </Text>
      </View>
      <View style={styles.right}>
        {badge ? (
          <View
            style={[
              styles.badge,
              {backgroundColor: tint(color, dark ? 0.2 : 0.1)},
            ]}>
            <Text style={[styles.badgeText, {color}]}>{badge.label}</Text>
          </View>
        ) : (
          <Text style={[styles.amount, {color: ink}]}>{amount}</Text>
        )}
        {side ? (
          <Text
            style={[
              styles.side,
              {color: timeColor || (dark ? '#A1A1B4' : '#A6A6A6')},
            ]}>
            {side}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const styles = StyleSheet.create({
  row: {
    height: px(70),
    borderRadius: px(10),
    marginBottom: px(15),
    paddingLeft: px(15),
    paddingRight: px(14),
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {width: px(44), height: px(44), marginRight: px(10)},
  mid: {flex: 1},
  title: {fontSize: px(16), lineHeight: px(22), fontWeight: '600'},
  time: {
    fontSize: px(12),
    lineHeight: px(17),
    marginTop: px(3),
    marginLeft: px(1),
  },
  right: {alignSelf: 'stretch', alignItems: 'flex-end'},
  amount: {
    fontSize: px(16),
    lineHeight: px(22),
    fontWeight: '600',
    marginTop: px(15),
    marginRight: px(1),
  },
  side: {fontSize: px(12), lineHeight: px(17), marginTop: px(3)},
  badge: {
    width: px(48),
    height: px(22),
    borderRadius: px(4),
    marginTop: px(13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {fontSize: px(11), lineHeight: px(15)},
});
