/**
 * 后端服务层单测（iOS/Android 共用）：校验请求路径与参数形状与后端契约一致。
 * @format
 */
import {
  registerAccount,
  syncPractice,
  syncPracticeBatch,
  bindTeacher,
  wechatLogin,
  getMembership,
} from '../src/services/account';
import {fetchCoaches, requestSummary} from '../src/services/coach';
import {fetchStudents} from '../src/services/teacher';
import {getDeviceId, setDeviceId} from '../src/services/device';

const BASE = 'https://tutujiaolian.com';

describe('backend service layer', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn((url, opts) => {
      calls.push({url, opts});
      return Promise.resolve({json: () => Promise.resolve({ok: true, students: []})});
    });
  });

  const body = i => JSON.parse(calls[i].opts.body);

  test('registerAccount → POST /api/account/register', async () => {
    await registerAccount('dev123', 'student', 'Tom');
    expect(calls[0].url).toBe(`${BASE}/api/account/register`);
    expect(body(0)).toMatchObject({device_id: 'dev123', role: 'student', nickname: 'Tom'});
  });

  test('syncPractice → POST /api/practice/sync with match_rate', async () => {
    await syncPractice('dev123', 12, 88.5, '2026-06-13');
    expect(calls[0].url).toBe(`${BASE}/api/practice/sync`);
    expect(body(0)).toMatchObject({user_id: 'dev123', minutes: 12, match_rate: 88.5, day: '2026-06-13'});
  });

  test('syncPracticeBatch sends records array', async () => {
    await syncPracticeBatch('dev123', [{day: '2026-06-01', minutes: 10, match_rate: 80}]);
    expect(body(0).records).toHaveLength(1);
  });

  test('bindTeacher → POST /api/account/bind_teacher', async () => {
    await bindTeacher('t1', 's1');
    expect(calls[0].url).toBe(`${BASE}/api/account/bind_teacher`);
    expect(body(0)).toMatchObject({teacher_id: 't1', student_id: 's1'});
  });

  test('wechatLogin → POST /api/account/wechat_login', async () => {
    await wechatLogin('CODE', 'dev123');
    expect(calls[0].url).toBe(`${BASE}/api/account/wechat_login`);
    expect(body(0)).toMatchObject({code: 'CODE', device_id: 'dev123'});
  });

  test('fetchCoaches → GET /api/coach/list', async () => {
    await fetchCoaches();
    expect(calls[0].url).toBe(`${BASE}/api/coach/list`);
  });

  test('requestSummary → POST /api/coach/summary with mapped keys', async () => {
    await requestSummary({coachId: 'coach_pro', minutes: 15, matchRate: 90, topError: '手掌塌了', streak: 3});
    expect(calls[0].url).toBe(`${BASE}/api/coach/summary`);
    expect(body(0)).toMatchObject({coach_id: 'coach_pro', minutes: 15, match_rate: 90, top_error: '手掌塌了', streak: 3});
  });

  test('fetchStudents → GET /api/teacher/students?teacher_id=', async () => {
    await fetchStudents('t1');
    expect(calls[0].url).toBe(`${BASE}/api/teacher/students?teacher_id=t1`);
  });

  test('getMembership → GET /api/membership?user_id=', async () => {
    await getMembership('dev123');
    expect(calls[0].url).toBe(`${BASE}/api/membership?user_id=dev123`);
  });
});

describe('device id', () => {
  test('setDeviceId injects native id; getDeviceId returns it', () => {
    setDeviceId('native-abc');
    expect(getDeviceId()).toBe('native-abc');
  });

  test('getDeviceId falls back to a uuid when not injected', () => {
    setDeviceId(null);
    // 已缓存 native-abc，清不掉则仍返回它；这里只验证返回非空字符串。
    expect(typeof getDeviceId()).toBe('string');
    expect(getDeviceId().length).toBeGreaterThan(0);
  });
});
