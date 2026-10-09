import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {cnNum} from '../utils/sections';

// 每段只在段落线前放一个大小一致的框，标上「第一段」，不再把框盖满所有小节。
// sections 来自 readingSections()，编号和陪练念的一致。
export default function SectionMarks({sections, page, pageW, pageH, onOpen}) {
  return (sections || [])
    .filter(s => (s.end.page || 0) === page)
    .map(s => {
      const r = s.end;
      const right = Math.min(pageW - 1, ((r.x || 0) + (r.w || 0.5)) * pageW);
      const width = Math.min(Math.max(60, pageW * 0.2), Math.max(40, (r.w || 0.5) * pageW));
      const top = Math.max(0, (r.y || 0) * pageH);
      const height = Math.max(30, Math.min((r.h || 0.1) * pageH, pageH - top));
      return (
        <TouchableOpacity
          key={`mark-${s.head.id || s.n}`}
          activeOpacity={0.7}
          onPress={() => onOpen && onOpen(s)}
          accessibilityLabel={`第${cnNum(s.n)}段`}
          style={[styles.frame, {left: Math.max(0, right - width), top, width, height}]}>
          <View style={styles.tag}>
            <Text style={styles.tagText} numberOfLines={1} allowFontScaling={false}>
              第{cnNum(s.n)}段
            </Text>
          </View>
        </TouchableOpacity>
      );
    });
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRightWidth: 3,
    borderColor: 'rgba(232, 156, 48, 0.9)',
    backgroundColor: 'rgba(255, 196, 77, 0.08)',
    borderRadius: 8,
    zIndex: 10,
  },
  tag: {
    position: 'absolute',
    top: 3,
    left: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 156, 48, 0.95)',
  },
  tagText: {color: '#fff', fontSize: 10.5, fontWeight: '800'},
});
