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
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {cnNum, sectionColor, sectionSpan, tint} from '../utils/sections';

export const NOTE_MAX = 120;
// 老师常写的几句，点一下接在后面，不用每次都打字。
const QUICK = ['慢练', '左手轻一点', '右手旋律唱出来', '注意指法', '数好拍子', '踏板换干净', '连音要连贯', '强弱对比明显'];

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

// 重点列表：学生端只列老师写了重点的段；老师端列出每一段，没写的点一下就能写。
export function SectionNoteList({sections, editable, onPick}) {
  const {colors} = useTheme();
  const rows = (sections || []).filter(s => editable || s.note);
  if (!rows.length) return null;
  return (
    <View style={[styles.card, {backgroundColor: colors.card}]}>
      <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
        {editable ? '每段的重点' : '老师写的重点'}
      </Text>
      <Text style={[styles.cardHint, {color: colors.textSecondary}]}>
        {editable
          ? '点一段写给学生看的重点。学生在谱上点「第几段」就能看到，陪练也会照着念。'
          : '谱上同一种颜色是同一段。点一条，就跳到谱上那一段。'}
      </Text>
      {rows.map(s => (
        <TouchableOpacity
          key={`note-${s.n}`}
          activeOpacity={0.7}
          onPress={() => onPick && onPick(s)}
          style={[styles.row, {borderLeftColor: sectionColor(s.n), backgroundColor: tint(sectionColor(s.n), 0.07)}]}>
          <Badge n={s.n} />
          <View style={{flex: 1}}>
            <View style={styles.rowHead}>
              <Text style={[styles.rowTitle, {color: colors.textPrimary}]}>第{cnNum(s.n)}段</Text>
              <Text style={[styles.rowSpan, {color: colors.textSecondary}]}>{sectionSpan(s)}</Text>
            </View>
            {s.note ? (
              <Text style={[styles.rowNote, {color: colors.textPrimary}]}>{s.note}</Text>
            ) : (
              <Text style={[styles.rowEmpty, {color: colors.textSecondary}]}>还没写，点这里写重点</Text>
            )}
          </View>
          <Text style={[styles.chev, {color: sectionColor(s.n)}]}>{editable ? '写' : '›'}</Text>
        </TouchableOpacity>
      ))}
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
}) {
  const {colors} = useTheme();
  const [text, setText] = useState('');
  useEffect(() => {
    setText(section ? section.note || '' : '');
  }, [section]);
  if (!section) return null;
  const color = sectionColor(section.n);
  const tips = (lessonTips || []).map(t => String(t || '').trim()).filter(Boolean);
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
            <Text style={[styles.sheetSpan, {color: colors.textSecondary}]}>{sectionSpan(section)}</Text>
          </View>
          {editable ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 360}}>
              <Text style={[styles.label, {color: colors.textPrimary}]}>写给学生的重点</Text>
              <TextInput
                value={text}
                onChangeText={t => setText(t.slice(0, NOTE_MAX))}
                placeholder="比如：左手轻一点，右手旋律唱出来"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={NOTE_MAX}
                style={[
                  styles.input,
                  {color: colors.textPrimary, borderColor: tint(color, 0.55), backgroundColor: tint(color, 0.05)},
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
                  <Text style={[styles.tipLabel, {color: colors.textSecondary}]}>本课建议</Text>
                  <View style={styles.quickWrap}>
                    {tips.map(w => (
                      <TouchableOpacity
                        key={`tip-${w}`}
                        onPress={() => append(w)}
                        style={[styles.quick, styles.tipChip, {borderColor: tint(color, 0.5)}]}>
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
                  <Text style={[styles.ghostText, {color: colors.textSecondary}]}>取消</Text>
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
                <Text style={[styles.readNote, {color: colors.textPrimary}]}>{section.note}</Text>
              ) : (
                <Text style={[styles.readEmpty, {color: colors.textSecondary}]}>
                  老师还没给这一段写重点。陪练会按「第几段」带你一段一段练。
                </Text>
              )}
              <View style={styles.actions}>
                {onLocate ? (
                  <TouchableOpacity onPress={onLocate} style={styles.ghostBtn}>
                    <Text style={[styles.ghostText, {color}]}>在谱上看这一段</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{flex: 1}} />
                <TouchableOpacity onPress={onClose} style={[styles.primaryBtn, {backgroundColor: color}]}>
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
  card: {borderRadius: 16, padding: 14, marginBottom: 14},
  cardTitle: {fontSize: 15, fontWeight: '800', marginBottom: 4},
  cardHint: {fontSize: 12, lineHeight: 17, marginBottom: 10},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    gap: 10,
  },
  rowHead: {flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2},
  rowTitle: {fontSize: 14, fontWeight: '800'},
  rowSpan: {fontSize: 11.5},
  rowNote: {fontSize: 15, lineHeight: 22},
  rowEmpty: {fontSize: 13, fontStyle: 'italic'},
  chev: {fontSize: 15, fontWeight: '800', paddingLeft: 4},
  badge: {width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center'},
  badgeText: {color: '#fff', fontSize: 13, fontWeight: '800'},
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.35)'},
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grip: {alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.35)', marginBottom: 12},
  sheetHead: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14},
  chip: {paddingHorizontal: 12, height: 26, borderRadius: 13, justifyContent: 'center'},
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
  quick: {borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, height: 28, justifyContent: 'center'},
  tipChip: {backgroundColor: 'rgba(128,128,128,0.08)'},
  tipLabel: {fontSize: 12.5, fontWeight: '700', marginTop: 12},
  quickText: {fontSize: 12.5, fontWeight: '700'},
  actions: {flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 8},
  ghostBtn: {height: 40, paddingHorizontal: 10, justifyContent: 'center'},
  ghostText: {fontSize: 14, fontWeight: '700'},
  deleteText: {fontSize: 14, fontWeight: '700', color: '#D14343'},
  primaryBtn: {height: 40, paddingHorizontal: 22, borderRadius: 20, justifyContent: 'center'},
  primaryText: {color: '#fff', fontSize: 15, fontWeight: '800'},
  readNote: {fontSize: 18, lineHeight: 28, fontWeight: '600'},
  readEmpty: {fontSize: 14.5, lineHeight: 22},
});
