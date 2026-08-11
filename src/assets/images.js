// 与安卓同源的真实图片资源（从 TutuCoach/app/src/main/res 复制）。
// 统一在此 require，screens 引用此处，保证与安卓 UI 资源完全一致。
export const Images = {
  // 吉祥物
  rabbitIdle: require('./img/rabbit_idle.png'), // 站立待机兔（首页）
  rabbitMascot: require('./img/rabbit_mascot.png'), // 抱琴谱兔（练琴）
  // 背景 / 渐变
  pageGradient: require('./img/bg_page_gradient.png'),
  // 首页整屏背景（蓝湖导出，含右上角星光；深/浅两版，1:1 还原）
  homeBgDark: require('./img/home_bg_dark.png'),
  homeBgLight: require('./img/home_bg_light.png'),
  homeSparkleLight: require('./img/ic_home_sparkle_light.png'),
  homeSparkleDark: require('./img/ic_home_sparkle_dark.png'),
  detectCoachHeadLight: require('./img/ic_det_coach_head_light.png'),
  detectCoachHeadDark: require('./img/ic_det_coach_head_dark.png'),
  // 练琴页（蓝湖 1:1）：背景、带缺口卡片容器、VIP/免费磁贴
  practiceBgDark: require('./img/practice_bg_dark.png'),
  practiceBgLight: require('./img/practice_bg_light.png'),
  practiceCardDark: require('./img/practice_card_dark.png'),
  practiceCardLight: require('./img/practice_card_light.png'),
  practiceTileVip: require('./img/practice_tile_vip.png'),
  practiceTileFree: require('./img/practice_tile_free.png'),
  practiceTileVipDark: require('./img/practice_tile_vip_dark.png'),
  practiceTileFreeDark: require('./img/practice_tile_free_dark.png'),
  practiceTileVipLight: require('./img/practice_tile_vip_light.png'),
  practiceTileFreeLight: require('./img/practice_tile_free_light.png'),
  // 我的（学生端）页（蓝湖 1:1）
  profileBgDark: require('./img/profile_bg_dark.png'),
  profileBgLight: require('./img/profile_bg_light.png'),
  pointsCardDark: require('./img/points_card_dark.png'),
  pointsCardLight: require('./img/points_card_light.png'),
  pfSub: require('./img/pf_sub.png'),
  pfCheckin: require('./img/pf_checkin.png'),
  pfTeacher: require('./img/pf_teacher.png'),
  pfHelp: require('./img/pf_help.png'),
  pfTheme: require('./img/pf_theme.png'),
  pfWechat: require('./img/pf_wechat.png'),
  pfEye: require('./img/pf_eye.png'),
  pfCopy: require('./img/pf_copy.png'),
  pfAvatar: require('./img/pf_avatar.png'),
  // 会员订阅页（蓝湖 1:1）
  subTopDark: require('./img/sub_top_dark.png'),
  subTopLight: require('./img/sub_top_light.png'),
  subVipDark: require('./img/sub_vip_dark.png'),
  subVipLight: require('./img/sub_vip_light.png'),
  subDiamondDark: require('./img/sub_diamond_dark.png'),
  subDiamondLight: require('./img/sub_diamond_light.png'),
  subSvipDark: require('./img/sub_svip_dark.png'),
  subSvipLight: require('./img/sub_svip_light.png'),
  subAiDark: require('./img/sub_ai_dark.png'),
  subAiLight: require('./img/sub_ai_light.png'),
  subStarDark: require('./img/sub_star_dark.png'),
  subStarLight: require('./img/sub_star_light.png'),
  // 我的（教师端）页（蓝湖 1:1）
  teacherAvatar: require('./img/t_avatar.png'),
  tAi: require('./img/t_ai.png'),
  tLesson: require('./img/t_lesson.png'),
  tStudent: require('./img/t_student.png'),
  tClass: require('./img/t_class.png'),
  // AI 选择页顶部背景（蓝湖 1:1）
  aiselectTopDark: require('./img/aiselect_top_dark.png'),
  aiselectTopLight: require('./img/aiselect_top_light.png'),
  // AI 分身列表（蓝湖 ai设置）
  ailistTopDark: require('./img/ailist_top_dark.png'),
  ailistTopLight: require('./img/ailist_top_light.png'),
  ailistEditDark: require('./img/ailist_edit_dark.png'),
  ailistEditLight: require('./img/ailist_edit_light.png'),
  ailistDeleteDark: require('./img/ailist_delete_dark.png'),
  ailistDeleteLight: require('./img/ailist_delete_light.png'),
  pointsCard: require('./img/bg_points_card_img.png'),
  cardHeaderGradient: require('./img/bg_card_header_gradient.png'),
  detectHeaderLight: require('./img/bg_detect_header_light.png'),
  detectHeaderDark: require('./img/bg_detect_header_dark.png'),
  detectCameraLight: require('./img/ic_det_camera_light.png'),
  detectCameraDark: require('./img/ic_det_camera_dark.png'),
  detectRingtoneLight: require('./img/ic_det_ringtone_light.png'),
  detectRingtoneDark: require('./img/ic_det_ringtone_dark.png'),
  detectFlipLight: require('./img/ic_camera_flip_lanhu_light.png'),
  detectFlipDark: require('./img/ic_camera_flip_lanhu_dark.png'),
  detectRabbitMascotLight: require('./img/ic_det_rabbit_mascot_light.png'),
  detectRabbitMascotDark: require('./img/ic_det_rabbit_mascot_dark.png'),
  detectRabbitLabelLight: require('./img/ic_det_rabbit_label_light.png'),
  detectRabbitLabelDark: require('./img/ic_det_rabbit_label_dark.png'),
  companionScrim: require('./img/bg_companion_scrim.png'),
  companionPhoto: require('./img/bg_companion_photo.png'),
  wmChatLight: require('./img/wm_chat_light.png'),
  // 装饰 / 徽标
  sparkle: require('./img/ic_bard_sparkle.png'),
  sparkleDark: require('./img/ic_bard_sparkle_dark.png'),
  // 练琴：「选择您的模型」小兔子图标 + AI陪练模式玻璃爱心（1:1 蓝湖）
  // 深色稿=紫色渐变(#7F47FE→#B595FF)，浅色稿=粉色渐变(#FF7A9A→#FF355F)
  modelRabbit: require('./img/ic_model_rabbit.png'),
  modelRabbitLight: require('./img/ic_model_rabbit_light.png'),
  // 练琴 AI陪练玻璃爱心：浅色/深色两套（浅色稿为淡紫玻璃，深色稿为深紫；避免浅色主题出现深紫矩形底）
  companionHeartLight: require('./img/ic_companion_heart_light.png'),
  companionHeartDark: require('./img/ic_companion_heart_dark.png'),
  companionHeart: require('./img/ic_companion_heart_dark.png'), // 兼容旧引用
  // 班级管理：学生列表紫色学士帽图标（1:1 蓝湖）
  studentListCap: require('./img/ic_student_list_cap.png'),
  classVipDark: require('./img/class_vip_dark.png'),
  classVipLight: require('./img/class_vip_light.png'),
  // 练琴大字水印（1:1 蓝湖，Arial Black + 精确渐变）：
  //   MUSIC 深色=空心描边(白0.3→0)，浅色=白0.2填充+描边(白1→0)
  //   CHAT  两主题一致=竖向渐变填充(白1→0) @不透明度0.6
  wmMusicDark: require('./img/wm_music_dark.png'),
  wmMusicLight: require('./img/wm_music_light.png'),
  wmChat: require('./img/wm_chat.png'),
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
  // AI 陪练模式（白色图标，适配深色顶栏）
  companionCode: require('./img/ic_companion_code.png'),
  companionVolume: require('./img/ic_companion_volume.png'),
  companionSend: require('./img/ic_companion_send.png'),
  metroMinus: require('./img/ic_metro_minus.png'),
  metroPlus: require('./img/ic_metro_plus.png'),
  metroNote: require('./img/ic_metro_note.png'),
};

export default Images;
