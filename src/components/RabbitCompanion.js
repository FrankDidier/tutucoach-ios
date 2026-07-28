import React, {useState, useEffect, useMemo, useRef} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Animated} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

const MESSAGES = [
  '嘿！准备好练琴了吗？',
  '今天也要加油哦～',
  '手型要保持好呀！',
  '你最棒了！冲冲冲！',
  '点我玩一下嘛～',
];

const RabbitCompanion = ({coachName = '专业老师'}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [message, setMessage] = useState(MESSAGES[0]);
  const [tapCount, setTapCount] = useState(0);
  const bounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const idle = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.05, duration: 1200, useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 1, duration: 1200, useNativeDriver: true,
        }),
      ]),
    );
    idle.start();
    return () => idle.stop();
  }, [bounceAnim]);

  const handleTap = () => {
    const next = (tapCount + 1) % MESSAGES.length;
    setTapCount(next);
    setMessage(MESSAGES[next]);

    Animated.sequence([
      Animated.timing(bounceAnim, {toValue: 1.2, duration: 100, useNativeDriver: true}),
      Animated.spring(bounceAnim, {toValue: 1, friction: 3, useNativeDriver: true}),
    ]).start();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleTap} activeOpacity={0.9}>
        <Animated.Text
          style={[styles.rabbit, {transform: [{scale: bounceAnim}]}]}>
          🐰
        </Animated.Text>
      </TouchableOpacity>

      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{message}</Text>
      </View>

      <Text style={styles.coachLabel}>{coachName}</Text>
    </View>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    container: {
      alignItems: 'center', marginVertical: 12,
      paddingVertical: 16, marginHorizontal: 16,
      backgroundColor: colors.cardAlt,
      borderRadius: 16,
      borderWidth: 0.5, borderColor: colors.cardBorder,
    },
    rabbit: {fontSize: 56},
    bubble: {
      marginTop: 8, backgroundColor: colors.card,
      paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: 16, maxWidth: '80%',
      shadowColor: '#000', shadowOpacity: 0.04,
      shadowRadius: 8, elevation: 2,
    },
    bubbleText: {fontSize: 14, color: colors.textPrimary, textAlign: 'center'},
    coachLabel: {
      marginTop: 8, fontSize: 12,
      color: colors.textSecondary,
    },
  });

export default RabbitCompanion;
