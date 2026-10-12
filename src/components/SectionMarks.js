import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {cnNum, sectionColor, tint} from '../utils/sections';

// 一段一个颜色：谱上只铺一层很淡的底色，左边一条同色的边，一眼看出哪几行是同一段，
// 相邻两段颜色不同，不再是一条一条一样的框。段首贴「第N段」小牌，老师写了重点就带一个「重点」。
// 底色不接点击（老师还能点谱面）；只有小牌能点。sections 来自 readingSections()，编号和陪练念的一致。
export default function SectionMarks({sections, page, pageW, pageH, onOpen, focusN}) {
  const out = [];
  (sections || []).forEach(s => {
    const color = sectionColor(s.n);
    const on = focusN === s.n;
    const rects = (s.rects || [s.end]).filter(r => (r.page || 0) === page);
    rects.forEach((r, k) => {
      const left = Math.max(0, (r.x || 0) * pageW);
      const top = Math.max(0, (r.y || 0) * pageH);
      const width = Math.max(24, Math.min(pageW - left, (r.w || 0.5) * pageW));
      const height = Math.max(20, Math.min(pageH - top, (r.h || 0.1) * pageH));
      out.push(
        <View
          key={`band-${s.n}-${r.id || k}`}
          pointerEvents="none"
          style={[
            styles.band,
            {
              left,
              top,
              width,
              height,
              backgroundColor: tint(color, on ? 0.2 : 0.075),
              borderColor: tint(color, on ? 0.75 : 0.28),
            },
          ]}>
          <View style={[styles.rail, {backgroundColor: tint(color, on ? 1 : 0.85)}]} />
        </View>,
      );
      if (k === 0) {
        out.push(
          <TouchableOpacity
            key={`tag-${s.n}-${r.id || k}`}
            activeOpacity={0.75}
            hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
            onPress={() => onOpen && onOpen(s)}
            accessibilityLabel={`第${cnNum(s.n)}段${s.note ? '，有重点' : ''}`}
            style={[styles.tag, {left: left + 2, top: Math.max(0, top - 10), backgroundColor: color}]}>
            <Text style={styles.tagText} numberOfLines={1} allowFontScaling={false}>
              第{cnNum(s.n)}段
            </Text>
            {s.note ? (
              <View style={styles.noteDot}>
                <Text style={[styles.noteDotText, {color}]} allowFontScaling={false}>
                  重点
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>,
        );
      }
    });
  });
  return out;
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 10,
  },
  rail: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 3},
  tag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 7,
    paddingRight: 3,
    height: 20,
    borderRadius: 10,
    zIndex: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 6,
  },
  tagText: {color: '#fff', fontSize: 11, fontWeight: '800', marginRight: 4},
  noteDot: {
    backgroundColor: '#fff',
    borderRadius: 7,
    paddingHorizontal: 4,
    height: 14,
    justifyContent: 'center',
  },
  noteDotText: {fontSize: 9.5, fontWeight: '800'},
});
