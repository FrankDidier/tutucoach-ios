import React, {useState} from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Switch, ScrollView,
} from 'react-native';
import {Colors} from '../utils/colors';
import {builtInProfiles} from '../utils/coachProfiles';

const SettingsScreen = ({navigation}) => {
  const [selectedCoach, setSelectedCoach] = useState('coach_pro');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <Text style={styles.backBtn}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设置</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* AI Coach Selection */}
        <Text style={styles.sectionTitle}>AI 教练角色</Text>
        <View style={styles.section}>
          {builtInProfiles.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.coachRow,
                selectedCoach === p.id && styles.coachRowActive,
              ]}
              onPress={() => setSelectedCoach(p.id)}>
              <View style={styles.coachInfo}>
                <Text style={styles.coachName}>{p.displayName}</Text>
                <Text style={styles.coachGreeting} numberOfLines={1}>
                  {p.greeting}
                </Text>
              </View>
              <View style={[
                styles.radio,
                selectedCoach === p.id && styles.radioActive,
              ]}>
                {selectedCoach === p.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sound & Haptics */}
        <Text style={styles.sectionTitle}>声音与反馈</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>语音播报</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{true: Colors.blueBrand, false: Colors.greyDivider}}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>震动反馈</Text>
            <Switch
              value={hapticEnabled}
              onValueChange={setHapticEnabled}
              trackColor={{true: Colors.blueBrand, false: Colors.greyDivider}}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Version & Subscription */}
        <Text style={styles.sectionTitle}>版本与订阅</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation?.navigate?.('Subscription')}>
            <Text style={styles.settingLabel}>会员订阅</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>当前版本</Text>
            <Text style={styles.versionText}>v1.5.26</Text>
          </View>
        </View>
      </ScrollView>
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
  scroll: {padding: 16, paddingBottom: 40},
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: Colors.textSecondary,
    marginBottom: 8, marginTop: 16, paddingLeft: 4,
  },
  section: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 8, elevation: 1,
    overflow: 'hidden',
  },
  coachRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    borderBottomWidth: 0.5, borderBottomColor: Colors.greyDivider,
  },
  coachRowActive: {backgroundColor: Colors.blueSurface},
  coachInfo: {flex: 1, marginRight: 12},
  coachName: {fontSize: 15, fontWeight: '600', color: Colors.textPrimary},
  coachGreeting: {fontSize: 12, color: Colors.textSecondary, marginTop: 2},
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.greyMedium,
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: {borderColor: Colors.blueBrand},
  radioDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.blueBrand,
  },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
  },
  settingLabel: {fontSize: 15, color: Colors.textPrimary},
  divider: {height: 0.5, backgroundColor: Colors.greyDivider, marginLeft: 16},
  arrow: {fontSize: 20, color: Colors.textSecondary},
  versionText: {fontSize: 14, color: Colors.textSecondary},
});

export default SettingsScreen;
