import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';

const PracticeScreen = ({navigation}) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Image
        source={Images.pageGradient}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>练琴</Text>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLine1}>HI~ ✨</Text>
            <Text style={styles.heroLine2}>我是你的兔兔教练</Text>
          </View>
          <Image
            source={Images.rabbitMascot}
            style={styles.mascot}
            resizeMode="contain"
          />
        </View>

        <View style={styles.selectionCard}>
          <View style={styles.selectionLabelRow}>
            <Image
              source={Images.sparkle}
              style={styles.selectionSparkle}
              resizeMode="contain"
            />
            <Text style={styles.selectionLabel}>选择您的模型进行练习</Text>
          </View>

          <View style={styles.cardsRow}>
            <TouchableOpacity
              style={styles.featureCard}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('Detection', {premium: true})
              }>
              <Image
                source={Images.cardVipPractice}
                style={styles.cardArt}
                resizeMode="cover"
              />
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle}>智能AI陪练</Text>
                <Text style={styles.cardSub}>会员专属</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureCard}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('Detection', {premium: false})
              }>
              <Image
                source={Images.cardFreeDetect}
                style={styles.cardArt}
                resizeMode="cover"
              />
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle}>智能手型检测</Text>
                <Text style={styles.cardSub}>免费检测</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  scroll: {
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 20,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 8,
  },
  heroLine1: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  heroLine2: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 6,
  },
  mascot: {
    width: 140,
    height: 140,
  },
  selectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  selectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectionSparkle: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  selectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardArt: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  cardTextWrap: {
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
    color: Colors.textSecondary,
  },
});

export default PracticeScreen;
