import React, {useState} from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import {Colors} from '../utils/colors';
import {builtInProfiles, CoachStyles} from '../utils/coachProfiles';

const styleLabel = s =>
  s === CoachStyles.ENCOURAGING ? '鼓励型' :
  s === CoachStyles.STRICT ? '严格型' : '活泼型';

const styleColor = s =>
  s === CoachStyles.ENCOURAGING ? Colors.greenLight :
  s === CoachStyles.STRICT ? Colors.blueBrand : Colors.goldPremium;

const TeacherScreen = ({navigation}) => {
  const [profiles, setProfiles] = useState([...builtInProfiles]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGreeting, setEditGreeting] = useState('');
  const [editStyle, setEditStyle] = useState(CoachStyles.ENCOURAGING);

  const addProfile = () => {
    if (!editName.trim()) {
      Alert.alert('请输入角色名称');
      return;
    }
    setProfiles(prev => [
      ...prev,
      {
        id: 'custom_' + Date.now(),
        displayName: editName.trim(),
        style: editStyle,
        speechRate: 1.0,
        pitch: 1.0,
        greeting: editGreeting || '你好，准备好练琴了吗？',
        encouragements: ['加油！'],
        errorTemplates: ['%s需要注意'],
        celebrationPhrases: ['练得不错！'],
      },
    ]);
    setModalVisible(false);
    setEditName('');
    setEditGreeting('');
  };

  const renderProfile = ({item}) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.displayName}</Text>
        <View style={[styles.badge, {backgroundColor: styleColor(item.style) + '30'}]}>
          <Text style={[styles.badgeText, {color: styleColor(item.style)}]}>
            {styleLabel(item.style)}
          </Text>
        </View>
      </View>
      <Text style={styles.greeting}>"{item.greeting}"</Text>
      <View style={styles.meta}>
        <Text style={styles.metaItem}>语速 {item.speechRate.toFixed(2)}x</Text>
        <Text style={styles.metaItem}>音调 {item.pitch.toFixed(2)}x</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <Text style={styles.backBtn}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>老师入口</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtn}>+ 新建</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={item => item.id}
        renderItem={renderProfile}
        contentContainerStyle={styles.list}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>新建 AI 教练</Text>
            <ScrollView>
              <Text style={styles.label}>角色名称</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="例：王老师的AI分身"
                maxLength={20}
              />

              <Text style={styles.label}>教学风格</Text>
              <View style={styles.styleRow}>
                {Object.values(CoachStyles).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.styleChip,
                      {borderColor: styleColor(s)},
                      editStyle === s && {backgroundColor: styleColor(s) + '20'},
                    ]}
                    onPress={() => setEditStyle(s)}>
                    <Text style={[styles.styleChipText, {color: styleColor(s)}]}>
                      {styleLabel(s)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>开场问候语</Text>
              <TextInput
                style={styles.input}
                value={editGreeting}
                onChangeText={setEditGreeting}
                placeholder="同学你好～"
                maxLength={100}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addProfile}>
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.greyLight},
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: Colors.greyDivider,
  },
  backBtn: {fontSize: 14, color: Colors.blueBrand},
  headerTitle: {fontSize: 17, fontWeight: '700', color: Colors.textPrimary},
  addBtn: {fontSize: 14, color: Colors.purplePrimary, fontWeight: '600'},
  list: {padding: 16},
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 10, elevation: 2,
  },
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardName: {fontSize: 17, fontWeight: '700', color: Colors.textPrimary},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12},
  badgeText: {fontSize: 12, fontWeight: '600'},
  greeting: {
    fontSize: 13, color: Colors.textSecondary,
    fontStyle: 'italic', marginTop: 10,
    padding: 10, backgroundColor: Colors.greyLight,
    borderRadius: 8,
  },
  meta: {flexDirection: 'row', gap: 16, marginTop: 12},
  metaItem: {fontSize: 12, color: Colors.textSecondary},
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {fontSize: 18, fontWeight: '700', marginBottom: 20, color: Colors.textPrimary},
  label: {fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 12},
  input: {
    borderWidth: 1.5, borderColor: Colors.greyDivider,
    borderRadius: 8, padding: 12, fontSize: 14,
  },
  styleRow: {flexDirection: 'row', gap: 10},
  styleChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 2,
  },
  styleChipText: {fontSize: 13, fontWeight: '600'},
  modalActions: {flexDirection: 'row', gap: 12, marginTop: 24},
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.greyLight, alignItems: 'center',
  },
  cancelText: {fontSize: 15, color: Colors.textPrimary, fontWeight: '600'},
  saveBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.blueBrand, alignItems: 'center',
  },
  saveText: {fontSize: 15, color: '#fff', fontWeight: '600'},
});

export default TeacherScreen;
