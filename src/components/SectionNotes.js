import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import {Images} from '../assets/images';
import {useTheme} from '../theme/ThemeContext';
import {cnNum, sectionColor, sectionSpan, tint} from '../utils/sections';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export const NOTE_MAX = 120;
// 老师常写的几句，点一下接在后面，不用每次都打字。
const QUICK = [
  '慢练',
  '左手轻一点',
  '右手旋律唱出来',
  '注意指法',
  '数好拍子',
  '踏板换干净',
  '连音要连贯',
  '强弱对比明显',
];

function Badge({n}) {
  const color = sectionColor(n);
  return (
    <View style={[styles.badge, {backgroundColor: color}]}>
      <Text style={styles.badgeText} allowFontScaling={false}>
        {n}
      </Text>
    </View>
  );
}

// 蓝湖「老师写的重点」卡 345 宽 r10：标题 14/400 (15,15)，说明 12 lh20；每段 315×65 r8 间距 15：
// 色号 20 r6 (10,10)，第N段 14/600，位置 11 (色 10% 底 r4)，右箭头 16；重点 13 lh18 (10,38)。
// 学生端只列老师写了重点的段；老师端列出每一段，没写的点一下就能写。
export function SectionNoteList({sections, editable, onPick, onReset}) {
  const {mode} = useTheme();
  const dark = mode === 'dark';
  const rows = (sections || []).filter(s => editable || s.note);
  if (!rows.length) return null;
  const hasNotes = (sections || []).some(s => String(s.note || '').trim());
  const ink = dark ? '#FFFFFF' : '#261216';
  const sub = dark ? '#A1A1B4' : '#A6A6A6';
  return (
    <View
      style={[styles.card, {backgroundColor: dark ? '#040428' : '#FFFFFF'}]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, {color: ink}]}>
          {editable ? '每段的重点' : '老师写的重点'}
        </Text>
        {editable && onReset && hasNotes ? (
          <TouchableOpacity
            onPress={onReset}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={styles.resetBtn}>重置</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.cardHint, {color: sub}]}>
        {editable
          ? '点一段写给学生看的重点，陪练也会照着念。'
          : '同一颜色代表乐谱中的同一段，点击即可定位'}
      </Text>
      {rows.map(s => {
        const color = sectionColor(s.n);
        return (
          <TouchableOpacity
            key={`note-${s.n}`}
            activeOpacity={0.7}
            onPress={() => onPick && onPick(s)}
            style={[
              styles.row,
              {backgroundColor: dark ? '#131444' : '#FAFAFA'},
            ]}>
            <View style={styles.rowHead}>
              <Badge n={s.n} />
              <Text style={[styles.rowTitle, {color: ink}]}>
                第{cnNum(s.n)}段
              </Text>
              {sectionSpan(s, sections) ? (
                <View
                  style={[
                    styles.spanChip,
                    {backgroundColor: tint(color, 0.1)},
                  ]}>
                  <Text style={[styles.rowSpan, {color}]}>
                    {sectionSpan(s, sections)}
                  </Text>
                </View>
              ) : null}
              <View style={{flex: 1}} />
              <Image
                source={dark ? Images.icRowArrowDark : Images.icRowArrowLight}
                style={styles.chev}
              />
            </View>
            {s.note ? (
              <Text
                style={[styles.rowNote, {color: dark ? '#FFFFFF' : '#3D3D3D'}]}>
                {s.note}
              </Text>
            ) : (
              <Text style={[styles.rowEmpty, {color: sub}]}>
                还没写，点这里写重点
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 点「第几段」弹出来的卡片。学生端只读，字大好认；老师端可以写、可以删这一段。
// lessonTips：上课录音整理出的句子，展示在原有快捷语下面，点一下追加，不替换推荐内容。
export function SectionNoteSheet({
  section,
  editable,
  onClose,
  onSave,
  onDelete,
  onLocate,
  lessonTips = [],
  allSections,
}) {
  const {colors} = useTheme();
  const [text, setText] = useState('');
  useEffect(() => {
    setText(section ? section.note || '' : '');
  }, [section]);
  if (!section) return null;
  const color = sectionColor(section.n);
  const tips = (lessonTips || [])
    .map(t => String(t || '').trim())
    .filter(Boolean);
  const append = w => {
    setText(prev => {
      const t = String(prev || '').trim();
      if (t.includes(w)) return prev;
      return (t ? `${t}，${w}` : w).slice(0, NOTE_MAX);
    });
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, {backgroundColor: colors.card}]}>
          <View style={styles.grip} />
          <View style={styles.sheetHead}>
            <View style={[styles.chip, {backgroundColor: color}]}>
              <Text style={styles.chipText}>第{cnNum(section.n)}段</Text>
            </View>
            <Text style={[styles.sheetSpan, {color: colors.textSecondary}]}>
              {sectionSpan(section, allSections)}
            </Text>
          </View>
          {editable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{maxHeight: 360}}>
              <Text style={[styles.label, {color: colors.textPrimary}]}>
                写给学生的重点
              </Text>
              <TextInput
                value={text}
                onChangeText={t => setText(t.slice(0, NOTE_MAX))}
                placeholder="比如：左手轻一点，右手旋律唱出来"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={NOTE_MAX}
                style={[
                  styles.input,
                  {
                    color: colors.textPrimary,
                    borderColor: tint(color, 0.55),
                    backgroundColor: tint(color, 0.05),
                  },
                ]}
              />
              <Text style={[styles.count, {color: colors.textSecondary}]}>
                {String(text || '').length}/{NOTE_MAX}
              </Text>
              <View style={styles.quickWrap}>
                {QUICK.map(w => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => append(w)}
                    style={[styles.quick, {borderColor: tint(color, 0.5)}]}>
                    <Text style={[styles.quickText, {color}]}>+ {w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {tips.length ? (
                <>
                  <Text
                    style={[styles.tipLabel, {color: colors.textSecondary}]}>
                    本课建议
                  </Text>
                  <View style={styles.quickWrap}>
                    {tips.map(w => (
                      <TouchableOpacity
                        key={`tip-${w}`}
                        onPress={() => append(w)}
                        style={[
                          styles.quick,
                          styles.tipChip,
                          {borderColor: tint(color, 0.5)},
                        ]}>
                        <Text style={[styles.quickText, {color}]}>+ {w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
              <View style={styles.actions}>
                {onDelete ? (
                  <TouchableOpacity onPress={onDelete} style={styles.ghostBtn}>
                    <Text style={styles.deleteText}>删除这一段</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{flex: 1}} />
                <TouchableOpacity onPress={onClose} style={styles.ghostBtn}>
                  <Text
                    style={[styles.ghostText, {color: colors.textSecondary}]}>
                    取消
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onSave && onSave(String(text || '').trim())}
                  style={[styles.primaryBtn, {backgroundColor: color}]}>
                  <Text style={styles.primaryText}>保存</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View>
              {section.note ? (
                <Text style={[styles.readNote, {color: colors.textPrimary}]}>
                  {section.note}
                </Text>
              ) : (
                <Text style={[styles.readEmpty, {color: colors.textSecondary}]}>
                  老师还没给这一段写重点。陪练会按「第几段」带你一段一段练。
                </Text>
              )}
              <View style={styles.actions}>
                {onLocate ? (
                  <TouchableOpacity onPress={onLocate} style={styles.ghostBtn}>
                    <Text style={[styles.ghostText, {color}]}>
                      在谱上看这一段
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{flex: 1}} />
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.primaryBtn, {backgroundColor: color}]}>
                  <Text style={styles.primaryText}>知道了</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: px(10),
    paddingHorizontal: px(15),
    paddingTop: px(15),
    paddingBottom: px(1),
    marginBottom: px(15),
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {fontSize: px(14), lineHeight: px(17)},
  resetBtn: {fontSize: px(13), fontWeight: '600', color: '#FF355F'},
  cardHint: {
    fontSize: px(12),
    lineHeight: px(20),
    marginTop: px(5),
    marginBottom: px(10),
  },
  row: {
    minHeight: px(65),
    borderRadius: px(8),
    padding: px(10),
    marginBottom: px(15),
  },
  rowHead: {flexDirection: 'row', alignItems: 'center', height: px(20)},
  rowTitle: {
    fontSize: px(14),
    lineHeight: px(20),
    fontWeight: '600',
    marginLeft: px(8),
  },
  spanChip: {
    height: px(20),
    borderRadius: px(4),
    paddingHorizontal: px(5),
    marginLeft: px(8),
    justifyContent: 'center',
  },
  rowSpan: {fontSize: px(11), lineHeight: px(15)},
  rowNote: {fontSize: px(13), lineHeight: px(18), marginTop: px(8)},
  rowEmpty: {fontSize: px(13), lineHeight: px(18), marginTop: px(8)},
  chev: {width: px(16), height: px(16)},
  badge: {
    width: px(20),
    height: px(20),
    borderRadius: px(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: px(14),
    lineHeight: px(20),
    fontWeight: '500',
  },
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.35)'},
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    marginBottom: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  chipText: {color: '#fff', fontSize: 14, fontWeight: '800'},
  sheetSpan: {fontSize: 12.5},
  label: {fontSize: 13.5, fontWeight: '700', marginBottom: 8},
  input: {
    minHeight: 96,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  count: {alignSelf: 'flex-end', fontSize: 11.5, marginTop: 4},
  quickWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  quick: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
    justifyContent: 'center',
  },
  tipChip: {backgroundColor: 'rgba(128,128,128,0.08)'},
  tipLabel: {fontSize: 12.5, fontWeight: '700', marginTop: 12},
  quickText: {fontSize: 12.5, fontWeight: '700'},
  actions: {flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 8},
  ghostBtn: {height: 40, paddingHorizontal: 10, justifyContent: 'center'},
  ghostText: {fontSize: 14, fontWeight: '700'},
  deleteText: {fontSize: 14, fontWeight: '700', color: '#D14343'},
  primaryBtn: {
    height: 40,
    paddingHorizontal: 22,
    borderRadius: 20,
    justifyContent: 'center',
  },
  primaryText: {color: '#fff', fontSize: 15, fontWeight: '800'},
  readNote: {fontSize: 18, lineHeight: 28, fontWeight: '600'},
  readEmpty: {fontSize: 14.5, lineHeight: 22},
});
