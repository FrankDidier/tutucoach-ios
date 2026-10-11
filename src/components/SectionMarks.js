import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {cnNum} from '../utils/sections';

// 每段每一行谱一个同样样式的细框，段首（换页后这一页的第一行也算）贴一个「第N段」小牌。
// 框本身不接点击，老师还能点谱面加段尾线；只有小牌能点。
// sections 来自 readingSections()，编号和陪练念的一致。
export default function SectionMarks({sections, page, pageW, pageH, onOpen}) {
  const out = [];
  (sections || []).forEach(s => {
    const rects = (s.rects || [s.end]).filter(r => (r.page || 0) === page);
    rects.forEach((r, k) => {
      const left = Math.max(0, (r.x || 0) * pageW);
      const top = Math.max(0, (r.y || 0) * pageH);
      const width = Math.max(24, Math.min(pageW - left, (r.w || 0.5) * pageW));
      const height = Math.max(20, Math.min(pageH - top, (r.h || 0.1) * pageH));
      out.push(
        <View
          key={`frame-${s.n}-${r.id || k}`}
          pointerEvents="none"
          style={[styles.frame, {left, top, width, height}]}
        />,
      );
      if (k === 0) {
        out.push(
          <TouchableOpacity
            key={`tag-${s.n}-${r.id || k}`}
            activeOpacity={0.7}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            onPress={() => onOpen && onOpen(s)}
            accessibilityLabel={`第${cnNum(s.n)}段`}
            style={[styles.tag, {left: left + 4, top: Math.max(0, top - 9)}]}>
            <Text style={styles.tagText} numberOfLines={1} allowFontScaling={false}>
              第{cnNum(s.n)}段
            </Text>
          </TouchableOpacity>,
        );
      }
    });
  });
  return out;
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(232, 156, 48, 0.85)',
    backgroundColor: 'rgba(255, 196, 77, 0.06)',
    borderRadius: 6,
    zIndex: 10,
  },
  tag: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: 'rgba(232, 156, 48, 0.95)',
    zIndex: 11,
  },
  tagText: {color: '#fff', fontSize: 11, fontWeight: '800'},
});
