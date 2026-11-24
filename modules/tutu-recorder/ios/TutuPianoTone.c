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
// 太低的音分辨不清半音，太高的多半是泛音，只取中间这一截。
#define CHROMA_LO 100.0f
#define CHROMA_HI 2500.0f

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
  int keep = t ? t->instrument : TUTU_INST_PIANO;
  memset(t, 0, sizeof(*t));
  t->instrument = keep;
  for (int i = 0; i < TUTU_TONE_N; i++) {
    t->hann[i] = 0.5f - 0.5f * (float)cos(2.0 * M_PI * i / (TUTU_TONE_N - 1));
  }
}

void tutu_tone_set_instrument(TutuPianoTone *t, int instrument) {
  if (!t) return;
  if (instrument < TUTU_INST_PIANO || instrument > TUTU_INST_ERHU) instrument = TUTU_INST_PIANO;
  if (t->instrument == instrument) return;
  tutu_tone_reset(t);
  t->instrument = instrument;
}

int tutu_tone_instrument(const TutuPianoTone *t) {
  return t ? t->instrument : TUTU_INST_PIANO;
}

// 琴弦的泛音隔 0.1 秒还在原地，差不到千分之二点五。
static float tol_for(float f) { return fmaxf(1.2f, 0.0025f * f); }

static int near_any(float f, const float *freqs, int n) {
  float tol = tol_for(f);
  for (int j = 0; j < n; j++) if (fabsf(f - freqs[j]) <= tol) return 1;
  return 0;
}

static int is_harmonic(float f, const float *bases, int n) {
  for (int i = 0; i < n; i++) {
    float k = bases[i];
    if (k <= 0.f) continue;
    int harm = (int)lround(f / k);
    if (harm >= 2 && harm <= 8 && fabsf(f - harm * k) <= fmaxf(3.f, 0.03f * f)) return 1;
  }
  return 0;
}

int tutu_tone_fundamentals(const float *freq, const float *amp, int count, int mono, int *out, int max) {
  float fs[16], as[16], score[16];
  int n = 0;
  for (int i = 0; i < count && n < 16; i++) {
    float f = freq[i], a = amp[i];
    if (a <= 0.f || f < 70.f || f > 2500.f) continue;
    int at = n;
    while (at > 0 && as[at - 1] < a) {
      fs[at] = fs[at - 1];
      as[at] = as[at - 1];
      at--;
    }
    fs[at] = f;
    as[at] = a;
    n++;
  }
  for (int i = 0; i < n; i++) {
    score[i] = as[i];
    for (int h = 2; h <= 6; h++) {
      float target = fs[i] * h;
      float tol = fmaxf(3.f, 0.03f * target);
      for (int j = 0; j < n; j++) {
        if (fabsf(fs[j] - target) <= tol) {
          score[i] += as[j];
          break;
        }
      }
    }
  }
  int order[16];
  for (int i = 0; i < n; i++) order[i] = i;
  for (int i = 0; i < n; i++) {
    for (int j = i + 1; j < n; j++) {
      if (score[order[j]] > score[order[i]]) {
        int sw = order[i];
        order[i] = order[j];
        order[j] = sw;
      }
    }
  }
  float kept[4];
  int kn = 0;
  int limit = mono ? 1 : 4;
  if (limit > max) limit = max;
  for (int oi = 0; oi < n && kn < limit; oi++) {
    float f = fs[order[oi]];
    if (is_harmonic(f, kept, kn)) continue;
    int w = 0;
    for (int k = 0; k < kn; k++) {
      float one = f;
      if (!is_harmonic(kept[k], &one, 1)) kept[w++] = kept[k];
    }
    kn = w;
    kept[kn++] = f;
  }
  int on = 0;
  for (int i = 0; i < kn && on < limit; i++) {
    int m = (int)lround(69.0 + 12.0 * log(kept[i] / 440.0) / log(2.0));
    if (m < 36 || m > 96) continue;
    int dup = 0;
    for (int j = 0; j < on; j++) if (out[j] == m) dup = 1;
    if (!dup) out[on++] = m;
  }
  return on;
}

static void add_chroma(TutuPianoTone *t, const float *freq, const float *amp, int count, int voiced) {
  if (voiced) {
    for (int i = 0; i < count; i++) {
      float f = freq[i];
      if (f < CHROMA_LO || f > CHROMA_HI) continue;
      int pc = (int)lround(12.0 * log(f / 261.6256) / log(2.0));
      pc = ((pc % 12) + 12) % 12;
      t->chromaAcc[pc] += sqrtf(amp[i]);
    }
    int mono = t->instrument == TUTU_INST_VIOLIN || t->instrument == TUTU_INST_ERHU
        || t->instrument == TUTU_INST_GUZHENG;
    int midis[4];
    int mn = tutu_tone_fundamentals(freq, amp, count, mono, midis, 4);
    for (int i = 0; i < mn; i++) {
      if (midis[i] >= 0 && midis[i] < 128) t->pitchCount[midis[i]]++;
    }
    t->chromaVoiced++;
  }
  if (++t->chromaFrames < TUTU_CHROMA_BLOCK) return;
  if (t->chromaVoiced >= TUTU_CHROMA_MIN) {
    double norm = 0;
    for (int k = 0; k < 12; k++) norm += (double)t->chromaAcc[k] * t->chromaAcc[k];
    norm = sqrt(norm);
    if (norm > 0) {
      int at = (t->chromaHead + t->chromaCount) % TUTU_CHROMA_KEEP;
      if (t->chromaCount == TUTU_CHROMA_KEEP) {
        at = t->chromaHead;
        t->chromaHead = (t->chromaHead + 1) % TUTU_CHROMA_KEEP;
      } else {
        t->chromaCount++;
      }
      for (int k = 0; k < 12; k++) {
        long v = lround(99.0 * t->chromaAcc[k] / norm);
        t->chroma[at][k] = (int)(v > 99 ? 99 : v);
      }
      int best = 0;
      for (int m = 0; m < 128; m++) if (t->pitchCount[m] > best) best = t->pitchCount[m];
      int need = t->chromaVoiced / 4;
      if (need < 2) need = 2;
      int mono = t->instrument == TUTU_INST_VIOLIN || t->instrument == TUTU_INST_ERHU
          || t->instrument == TUTU_INST_GUZHENG;
      int cap = mono ? 1 : 4;
      int gn = 0;
      while (gn < cap) {
        int pick = -1;
        for (int m = 0; m < 128; m++) {
          if (t->pitchCount[m] >= need && (pick < 0 || t->pitchCount[m] > t->pitchCount[pick])) pick = m;
        }
        if (pick < 0) break;
        t->pitch[at][gn++] = pick;
        t->pitchCount[pick] = 0;
      }
      t->pitchN[at] = gn;
    }
  }
  memset(t->chromaAcc, 0, sizeof(t->chromaAcc));
  memset(t->pitchCount, 0, sizeof(t->pitchCount));
  t->chromaFrames = 0;
  t->chromaVoiced = 0;
}

int tutu_tone_drain_pitches(TutuPianoTone *t, int out[][4], int *counts, int max) {
  if (!t) return 0;
  int n = t->chromaCount < max ? t->chromaCount : max;
  int skip = t->chromaCount - n;
  for (int i = 0; i < n; i++) {
    int at = (t->chromaHead + skip + i) % TUTU_CHROMA_KEEP;
    int c = t->pitchN[at];
    if (c < 0) c = 0;
    if (c > 4) c = 4;
    counts[i] = c;
    for (int k = 0; k < c; k++) out[i][k] = t->pitch[at][k];
    t->pitchN[at] = 0;
  }
  return n;
}

int tutu_tone_drain_chroma(TutuPianoTone *t, int out[][12], int max) {
  if (!t) return 0;
  int n = t->chromaCount < max ? t->chromaCount : max;
  int skip = t->chromaCount - n;
  for (int i = 0; i < n; i++) {
    int at = (t->chromaHead + skip + i) % TUTU_CHROMA_KEEP;
    memcpy(out[i], t->chroma[at], sizeof(int) * 12);
  }
  t->chromaHead = 0;
  t->chromaCount = 0;
  return n;
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
  add_chroma(t, freq, amp, count, rms >= t->gate[r]);
  t->ringAt = (r + 1) % TUTU_TONE_FRAMES;
  if (t->ringCount < TUTU_TONE_FRAMES) t->ringCount++;
  if (t->frames >= TUTU_TONE_FRAMES && t->frames % TUTU_TONE_CHECK == 0) {
    TutuToneLevel lv = tutu_tone_level(t);
    if (tutu_tone_is_playing(lv, t->instrument)) {
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

int tutu_tone_is_playing(TutuToneLevel lv, int instrument) {
  if (instrument == TUTU_INST_VIOLIN || instrument == TUTU_INST_ERHU) {
    /* 弓弦：持续泛音锁住即可；不要求像钢琴那样明显衰减。 */
    if (lv.loud < 0.14f) return 0;
    return (lv.tframes >= 0.22f && lv.piano >= 0.26f)
        || lv.p3 >= 0.30f
        || (lv.tframes >= 0.32f && lv.loud >= 0.22f);
  }
  if (instrument == TUTU_INST_GUZHENG) {
    if (lv.loud < 0.15f || lv.swing < 1.03f) return 0;
    return (lv.tframes >= 0.24f && lv.fall >= 0.30f) || lv.p3 >= 0.34f;
  }
  /* piano */
  if (lv.loud < 0.18f || lv.swing < 1.04f) return 0;
  return (lv.tframes >= 0.28f && lv.fall >= 0.40f) || lv.p3 >= 0.42f;
}

int tutu_tone_is_piano(TutuToneLevel lv) {
  return tutu_tone_is_playing(lv, TUTU_INST_PIANO);
}

int tutu_tone_heard(const TutuPianoTone *t, TutuToneLevel *out) {
  if (t->hitPrev > 0 && t->frames - t->hitPrev <= TUTU_TONE_RECENT) {
    *out = t->hit;
    return 1;
  }
  *out = tutu_tone_level(t);
  return 0;
}
