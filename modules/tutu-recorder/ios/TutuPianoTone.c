#include "TutuPianoTone.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

// 琴离手机远一点、弹得轻一点也要算上；安静房间的底噪大约 0.003。
#define LOUD_RAW 0.006f
#define FMIN 70.0f
#define FMAX 4200.0f

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

static void analyze(TutuPianoTone *t) {
  float *re = t->re, *im = t->im, *mag = t->mag;
  double acc = 0;
  for (int i = TUTU_TONE_N - TUTU_TONE_HOP; i < TUTU_TONE_N; i++) acc += (double)t->window[i] * t->window[i];
  float rms = (float)sqrt(acc / TUTU_TONE_HOP);
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

  float freq[TUTU_TONE_PEAKS], amp[TUTU_TONE_PEAKS];
  int count = 0;
  if (top > 0.f) {
    for (int k = lo; k < hi; k++) {
      float a = mag[k - 1], b = mag[k], c = mag[k + 1];
      if (!(b > a && b >= c && b >= 0.08f * top)) continue;
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

  float steady = 0.f;
  int slot = t->peakAt;
  if (t->frames >= TUTU_TONE_LAG && count > 0) {
    int old = (slot + 1) % (TUTU_TONE_LAG + 1);
    float tot = 0.f, hit = 0.f;
    for (int i = 0; i < count; i++) {
      tot += amp[i];
      float tol = fmaxf(2.0f, 0.006f * freq[i]);
      for (int j = 0; j < t->peakCount[old]; j++) {
        if (fabsf(freq[i] - t->peakFreq[old][j]) <= tol) {
          hit += amp[i];
          break;
        }
      }
    }
    steady = tot > 0.f ? hit / tot : 0.f;
  }
  memcpy(t->peakFreq[slot], freq, sizeof(float) * count);
  t->peakCount[slot] = count;
  t->peakAt = (slot + 1) % (TUTU_TONE_LAG + 1);
  t->frames++;

  t->rms[t->ringAt] = rms;
  t->steady[t->ringAt] = steady;
  t->ringAt = (t->ringAt + 1) % TUTU_TONE_FRAMES;
  if (t->ringCount < TUTU_TONE_FRAMES) t->ringCount++;
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

TutuToneLevel tutu_tone_level(const TutuPianoTone *t) {
  TutuToneLevel lv = {0.f, 0.f, 0.f};
  int n = t->ringCount;
  if (n == 0) return lv;
  float st[TUTU_TONE_FRAMES], rs[TUTU_TONE_FRAMES], all[TUTU_TONE_FRAMES];
  int loud = 0, recent = 0;
  for (int i = 0; i < n; i++) {
    int at = (t->ringAt - 1 - i + TUTU_TONE_FRAMES) % TUTU_TONE_FRAMES;
    all[i] = t->rms[at];
    if (t->rms[at] >= LOUD_RAW) st[loud++] = t->steady[at];
    if (i < TUTU_TONE_FRAMES / 2) rs[recent++] = t->rms[at];
  }
  lv.loud = (float)loud / TUTU_TONE_FRAMES;
  if (loud > 0) {
    qsort(st, loud, sizeof(float), cmp_float);
    lv.piano = loud % 2 ? st[loud / 2] : 0.5f * (st[loud / 2 - 1] + st[loud / 2]);
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
  return lv.loud >= 0.3f && lv.piano >= 0.25f && lv.swing >= 1.4f;
}
