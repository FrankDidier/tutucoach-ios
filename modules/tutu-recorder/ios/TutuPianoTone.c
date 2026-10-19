#include "TutuPianoTone.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#define FMIN 70.0f
#define FMAX 4200.0f
// 峰至少要有最响那个峰的 3%，轻轻的琴声混在说话里也要留得下来。
#define PEAK_REL 0.03f
// 安静房间的底噪大约 0.003；门限是底噪的两倍，但不低于这个数。
#define GATE_MIN 0.0012f
#define GATE_X 2.0f
// 底噪每帧最多往上爬一点点，一直有声音时不会把琴声当成底噪。
#define FLOOR_RISE 1.0005f
#define SLOTS (TUTU_TONE_LAG2 + 1)

static void fft(float *re, float *im, int n) {
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      float tr = re[i]; re[i] = re[j]; re[j] = tr;
      float ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (int len = 2; len <= n; len <<= 1) {
    double ang = -2.0 * M_PI / len;
    float wr = (float)cos(ang), wi = (float)sin(ang);
    for (int i = 0; i < n; i += len) {
      float cr = 1.f, ci = 0.f;
      for (int k = 0; k < len / 2; k++) {
        int a = i + k, b = i + k + len / 2;
        float xr = re[b] * cr - im[b] * ci;
        float xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        float nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

void tutu_tone_reset(TutuPianoTone *t) {
  memset(t, 0, sizeof(*t));
  for (int i = 0; i < TUTU_TONE_N; i++) {
    t->hann[i] = 0.5f - 0.5f * (float)cos(2.0 * M_PI * i / (TUTU_TONE_N - 1));
  }
}

// 琴弦的泛音隔 0.1 秒还在原地，差不到千分之二点五。
static float tol_for(float f) { return fmaxf(1.2f, 0.0025f * f); }

static int near_any(float f, const float *freqs, int n) {
  float tol = tol_for(f);
  for (int j = 0; j < n; j++) if (fabsf(f - freqs[j]) <= tol) return 1;
  return 0;
}

static void analyze(TutuPianoTone *t) {
  float *re = t->re, *im = t->im, *mag = t->mag;
  double acc = 0;
  for (int i = TUTU_TONE_N - TUTU_TONE_HOP; i < TUTU_TONE_N; i++) acc += (double)t->window[i] * t->window[i];
  float rms = (float)sqrt(acc / TUTU_TONE_HOP);
  t->floor = (t->frames == 0 || rms < t->floor) ? rms : t->floor * FLOOR_RISE;
  for (int i = 0; i < TUTU_TONE_N; i++) {
    re[i] = t->window[i] * t->hann[i];
    im[i] = 0.f;
  }
  fft(re, im, TUTU_TONE_N);
  for (int k = 0; k <= TUTU_TONE_N / 2; k++) mag[k] = sqrtf(re[k] * re[k] + im[k] * im[k]);

  int lo = (int)(FMIN * TUTU_TONE_N / TUTU_TONE_RATE);
  int hi = (int)(FMAX * TUTU_TONE_N / TUTU_TONE_RATE);
  float top = 0.f;
  for (int k = lo - 1; k < hi + 2; k++) if (mag[k] > top) top = mag[k];

  int slot = t->peakAt;
  float *freq = t->peakFreq[slot], *amp = t->peakAmp[slot];
  int count = 0;
  if (top > 0.f) {
    for (int k = lo; k < hi; k++) {
      float a = mag[k - 1], b = mag[k], c = mag[k + 1];
      if (!(b > a && b >= c && b >= PEAK_REL * top)) continue;
      double la = log(a + 1e-12), lb = log(b + 1e-12), lc = log(c + 1e-12);
      double d = la - 2 * lb + lc;
      double off = d < 0 ? 0.5 * (la - lc) / d : 0.0;
      float f = (float)((k + off) * TUTU_TONE_RATE / TUTU_TONE_N);
      // 只留最响的几个峰
      int at = count < TUTU_TONE_PEAKS ? count++ : -1;
      if (at < 0) {
        int weakest = 0;
        for (int j = 1; j < TUTU_TONE_PEAKS; j++) if (amp[j] < amp[weakest]) weakest = j;
        if (amp[weakest] >= b) continue;
        at = weakest;
      }
      freq[at] = f;
      amp[at] = b;
    }
  }

  float tight = 0.f, fall = 0.f, rise = 0.f;
  int pers = 0;
  if (t->frames >= TUTU_TONE_LAG && count > 0) {
    int old = (slot - TUTU_TONE_LAG + SLOTS) % SLOTS;
    const float *of = t->peakFreq[old], *oa = t->peakAmp[old];
    int on = t->peakCount[old];
    float tot = 0.f, hit = 0.f;
    for (int i = 0; i < count; i++) {
      tot += amp[i];
      float bd = tol_for(freq[i]);
      int best = -1;
      for (int j = 0; j < on; j++) {
        float d = fabsf(freq[i] - of[j]);
        if (d <= bd) { bd = d; best = j; }
      }
      if (best < 0) continue;
      hit += amp[i];
      if (amp[i] < 0.97f * oa[best]) fall += amp[i];
      else if (amp[i] > 1.03f * oa[best]) rise += amp[i];
    }
    tight = tot > 0.f ? hit / tot : 0.f;
    if (t->frames >= TUTU_TONE_LAG2) {
      int old2 = (slot - TUTU_TONE_LAG2 + SLOTS) % SLOTS;
      for (int i = 0; i < count; i++) {
        if (near_any(freq[i], of, on) && near_any(freq[i], t->peakFreq[old2], t->peakCount[old2])) pers++;
      }
    }
  }
  t->peakCount[slot] = count;
  t->peakAt = (slot + 1) % SLOTS;
  t->frames++;

  int r = t->ringAt;
  t->rms[r] = rms;
  t->gate[r] = fmaxf(GATE_MIN, GATE_X * t->floor);
  t->tight[r] = tight;
  t->fall[r] = fall;
  t->rise[r] = rise;
  t->pers[r] = pers;
  t->ringAt = (r + 1) % TUTU_TONE_FRAMES;
  if (t->ringCount < TUTU_TONE_FRAMES) t->ringCount++;
  if (t->frames >= TUTU_TONE_FRAMES && t->frames % TUTU_TONE_CHECK == 0) {
    TutuToneLevel lv = tutu_tone_level(t);
    if (tutu_tone_is_piano(lv)) {
      t->hitPrev = t->hitLast;
      t->hitLast = t->frames;
      t->hit = lv;
    }
  }
}

void tutu_tone_push(TutuPianoTone *t, const float *samples, int count) {
  for (int i = 0; i < count; i++) {
    if (t->filled < TUTU_TONE_N) {
      t->window[t->filled++] = samples[i];
      if (t->filled == TUTU_TONE_N) analyze(t);
      continue;
    }
    t->hop[t->fresh++] = samples[i];
    if (t->fresh == TUTU_TONE_HOP) {
      memmove(t->window, t->window + TUTU_TONE_HOP, sizeof(float) * (TUTU_TONE_N - TUTU_TONE_HOP));
      memcpy(t->window + TUTU_TONE_N - TUTU_TONE_HOP, t->hop, sizeof(float) * TUTU_TONE_HOP);
      t->fresh = 0;
      analyze(t);
    }
  }
}

static int cmp_float(const void *a, const void *b) {
  float x = *(const float *)a, y = *(const float *)b;
  return x < y ? -1 : (x > y ? 1 : 0);
}

static float median(float *v, int n) {
  qsort(v, n, sizeof(float), cmp_float);
  return n % 2 ? v[n / 2] : 0.5f * (v[n / 2 - 1] + v[n / 2]);
}

TutuToneLevel tutu_tone_level(const TutuPianoTone *t) {
  TutuToneLevel lv = {0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f};
  int n = t->ringCount;
  if (n == 0) return lv;
  float tg[TUTU_TONE_FRAMES], rs[TUTU_TONE_FRAMES], all[TUTU_TONE_FRAMES];
  int loud = 0, recent = 0, locked = 0, held = 0;
  double fa = 0, ri = 0;
  for (int i = 0; i < n; i++) {
    int at = (t->ringAt - 1 - i + TUTU_TONE_FRAMES) % TUTU_TONE_FRAMES;
    all[i] = t->rms[at];
    if (i < TUTU_TONE_FRAMES / 2) rs[recent++] = t->rms[at];
    if (t->rms[at] < t->gate[at]) continue;
    tg[loud++] = t->tight[at];
    if (t->pers[at] >= 3) held++;
    if (t->tight[at] >= 0.2f) {
      locked++;
      fa += t->fall[at];
      ri += t->rise[at];
    }
  }
  lv.loud = (float)loud / TUTU_TONE_FRAMES;
  if (loud > 0) {
    lv.tframes = (float)locked / loud;
    lv.p3 = (float)held / loud;
    lv.fall = locked > 0 ? (float)(fa / fmax(fa + ri, 1e-9)) : 0.f;
    lv.piano = median(tg, loud);
  }
  // 琴键一下一下按、按完慢慢变弱，响度一直在起落；冰箱、风扇的嗡嗡声几乎不变。
  qsort(all, n, sizeof(float), cmp_float);
  float low = all[(int)(0.1f * (n - 1))], high = all[(int)(0.9f * (n - 1))];
  lv.swing = high / (low > 1e-5f ? low : 1e-5f);
  qsort(rs, recent, sizeof(float), cmp_float);
  float r = rs[(int)(0.75f * (recent - 1))] / 0.20f;
  lv.rms = r > 1.f ? 1.f : r;
  return lv;
}

int tutu_tone_is_piano(TutuToneLevel lv) {
  /* 再放宽一点：远琴、弱奏、踏板残响时也别轻易判成「没弹」。 */
  if (lv.loud < 0.18f || lv.swing < 1.04f) return 0;
  return (lv.tframes >= 0.28f && lv.fall >= 0.40f) || lv.p3 >= 0.42f;
}

int tutu_tone_heard(const TutuPianoTone *t, TutuToneLevel *out) {
  if (t->hitPrev > 0 && t->frames - t->hitPrev <= TUTU_TONE_RECENT) {
    *out = t->hit;
    return 1;
  }
  *out = tutu_tone_level(t);
  return 0;
}
