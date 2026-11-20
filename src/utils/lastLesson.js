// 蓝湖学生格副标题：今天上过课 / 昨天 / M月D日 / 点击上课（sec 为最近一次上课的秒级时间戳）
export const lastLessonText = sec => {
  if (!sec) return '点击上课';
  const d = new Date(sec * 1000);
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff <= 0) return '今天上过课';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
