import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import {Colors} from '../utils/colors';
import ScreenHeader from '../components/ScreenHeader';
import {listStudents, saveStudent, deleteStudent} from '../services/students';
import {getDeviceId} from '../services/device';
import {registerAccount, bindTeacher} from '../services/account';

// 对应安卓 StudentEntryActivity：录入表单（姓名必填 / 学号 / 备注）+ 列表（点编辑、长按删除）。
const StudentEntryScreen = ({navigation}) => {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    listStudents().then(setStudents);
  }, []);

  const resetForm = () => {
    setName('');
    setStudentId('');
    setNote('');
    setEditingId(null);
  };

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入学生姓名');
      return;
    }
    const sid = studentId.trim();
    const next = await saveStudent({
      localId: editingId,
      name: name.trim(),
      studentId: sid,
      note: note.trim(),
    });
    setStudents(next);
    resetForm();
    // 学号填了完整学生 ID（≥12 位）时，顺带在服务端把该学生绑到本老师名下（入班）。
    if (sid.length >= 12) {
      try {
        const tid = getDeviceId();
        await registerAccount(tid, 'teacher');
        const r = await bindTeacher(tid, sid);
        if (r && r.ok) {
          Alert.alert('已保存并入班', '学生已绑定到你的班级，班级管理里可看到他的练习数据。');
          return;
        }
        if (r && r.error === 'not_found') {
          Alert.alert('已保存', '学生信息已保存（该 ID 在服务端未找到，入班未成功：请确认学生已打开过 App 并复制了正确的完整 ID）。');
          return;
        }
      } catch (e) {
        // 网络异常：本地已保存，入班下次可重试
      }
    }
    Alert.alert('已保存', '学生信息已保存');
  };

  const onEdit = s => {
    setEditingId(s.localId);
    setName(s.name);
    setStudentId(s.studentId || '');
    setNote(s.note || '');
  };

  const onDelete = s => {
    Alert.alert('删除学生', `确定删除「${s.name}」吗？`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const next = await deleteStudent(s.localId);
          setStudents(next);
          if (editingId === s.localId) resetForm();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScreenHeader title="学生信息录入" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.formCard}>
          <Text style={styles.label}>姓名 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="请输入学生姓名"
            placeholderTextColor={Colors.greyMedium}
          />
          <Text style={styles.label}>学号</Text>
          <TextInput
            style={styles.input}
            value={studentId}
            onChangeText={setStudentId}
            placeholder="可选（≥12位可服务端绑定）"
            placeholderTextColor={Colors.greyMedium}
          />
          <Text style={styles.label}>备注</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={note}
            onChangeText={setNote}
            placeholder="可选"
            placeholderTextColor={Colors.greyMedium}
            multiline
          />
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveText}>{editingId ? '保存修改' : '添加学生'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>已录入学生（{students.length}）</Text>
        {students.length === 0 ? (
          <Text style={styles.empty}>暂无学生，填写上方表单进行录入。</Text>
        ) : (
          students.map(s => (
            <TouchableOpacity
              key={s.localId}
              style={styles.studentRow}
              activeOpacity={0.7}
              onPress={() => onEdit(s)}
              onLongPress={() => onDelete(s)}>
              <View style={{flex: 1}}>
                <Text style={styles.studentName}>{s.name}</Text>
                {s.studentId ? (
                  <Text style={styles.studentSub}>学号：{s.studentId}</Text>
                ) : null}
                {s.note ? (
                  <Text style={styles.studentSub}>备注：{s.note}</Text>
                ) : null}
              </View>
              <Text style={styles.editHint}>编辑 ›</Text>
            </TouchableOpacity>
          ))
        )}
        <Text style={styles.tip}>提示：点按编辑，长按删除。</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  scroll: {padding: 16, paddingBottom: 40},
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  label: {fontSize: 13, color: Colors.textSecondary, marginBottom: 6, marginTop: 10},
  input: {
    borderWidth: 1,
    borderColor: Colors.greyDivider,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: '#FAFAFA',
  },
  inputMultiline: {height: 70, textAlignVertical: 'top'},
  saveBtn: {
    marginTop: 18,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  empty: {fontSize: 14, color: Colors.textSecondary, marginBottom: 10},
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  studentName: {fontSize: 15, fontWeight: '700', color: Colors.textPrimary},
  studentSub: {fontSize: 12, color: Colors.textSecondary, marginTop: 2},
  editHint: {fontSize: 13, color: Colors.pinkPrimary, fontWeight: '600'},
  tip: {fontSize: 12, color: Colors.textSecondary, marginTop: 8},
});

export default StudentEntryScreen;
