// 与安卓同源的真实图片资源（从 TutuCoach/app/src/main/res 复制）。
// 统一在此 require，screens 引用此处，保证与安卓 UI 资源完全一致。
export const Images = {
  // 吉祥物
  rabbitIdle: require('./img/rabbit_idle.png'), // 站立待机兔（首页）
  rabbitMascot: require('./img/rabbit_mascot.png'), // 抱琴谱兔（练琴）
  // 背景 / 渐变
  pageGradient: require('./img/bg_page_gradient.png'),
  pointsCard: require('./img/bg_points_card_img.png'),
  cardHeaderGradient: require('./img/bg_card_header_gradient.png'),
  // 装饰 / 徽标
  sparkle: require('./img/ic_bard_sparkle.png'),
  diamondLarge: require('./img/ic_diamond_large.png'),
  vipText: require('./img/ic_vip_text.png'),
  vipBanner: require('./img/bg_vip_banner.png'),
  // 底部导航
  tabHome: require('./img/ic_tab_home_png.png'),
  tabPractice: require('./img/ic_tab_practice_png.png'),
  tabProfile: require('./img/ic_tab_profile_png.png'),
  // 练琴卡片
  cardFreeDetect: require('./img/card_free_detect.png'),
  cardVipPractice: require('./img/card_vip_practice.png'),
  // 检测页
  photoTemplate: require('./img/ic_photo_template.png'),
  ringtoneSelect: require('./img/ic_ringtone_select.png'),
  // 头像
  avatarUser: require('./img/avatar_default_user.png'),
  avatarRabbit: require('./img/avatar_default_rabbit.png'),
  coachPro: require('./img/coach_avatar_pro.png'),
  // 「我的」菜单 / 教师菜单图标
  menuSubscription: require('./img/ic_subscription_menu.png'),
  menuCheckin: require('./img/ic_checkin_stats.png'),
  menuAiTraining: require('./img/ic_ai_training.png'),
  menuStudentEntry: require('./img/ic_student_entry.png'),
  menuClassManage: require('./img/ic_class_manage_menu.png'),
  menuAiSettings: require('./img/ic_ai_settings_menu.png'),
  // 其它
  sendBtn: require('./img/ic_send_btn.png'),
  eyeFill: require('./img/ic_eye_fill.png'),
};

export default Images;
