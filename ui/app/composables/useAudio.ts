/**
 * Race audio for this device: voice callouts (speech synthesis) and tones.
 * Settings use the classic interface's localStorage keys
 * ('rotorhazard.<name>'), so a device keeps its preferences in both UIs.
 */
export const AUDIO_DEFAULTS = {
  voice_string_language: 'match-timer',
  voice_language: '',
  voice_volume: 1.0,
  voice_rate: 1.25,
  voice_pitch: 1.0,
  voice_callsign: 1,
  voice_lap_count: 2,
  voice_team_lap_count: 1,
  voice_lap_time: 1,
  voice_race_timer: 2,
  voice_race_winner: 1,
  voice_if_node_finished: 0,
  voice_split_timer: 0,
  voice_race_leader: 0,
  tone_volume: 1.0,
  beep_crossing_entered: false,
  beep_crossing_exited: false,
  beep_manual_lap_button: false,
  beep_race_leader_lap: false,
  beep_race_winner_declared: false,
  beep_cluster_connect: false,
  use_mp3_tones: false,
  beep_on_first_pass_button: false,
  indicator_beep_volume: 0.5
}
export type AudioSettings = typeof AUDIO_DEFAULTS & { enabled: boolean }

function load(): AudioSettings {
  const s: any = { ...AUDIO_DEFAULTS, enabled: true }
  if (!import.meta.client) return s
  for (const k of Object.keys(s)) {
    try {
      const raw = localStorage.getItem('rotorhazard.' + k)
      if (raw !== null) s[k] = JSON.parse(raw)
    } catch { /* ignore */ }
  }
  return s
}

const settings = reactive<AudioSettings>(load())
const unlocked = ref(false)
let ctx: AudioContext | null = null
let started = false
const queue: { text: string, tone?: 'leader' | 'winner' }[] = []
let winnerDeclared = false

const NODE_TONES = [440, 466.16, 493.88, 523.25, 554.37, 587.33, 622.25, 659.25]

function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function playTone(durationMs: number, frequency: number, volume: number, type: OscillatorType = 'triangle', fadeSec = 0.01) {
  if (volume <= 0) return
  try {
    const c = audioCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(volume, c.currentTime)
    gain.gain.setValueAtTime(volume, c.currentTime + Math.max(0, durationMs / 1000 - fadeSec))
    gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + durationMs / 1000 + 0.05)
  } catch { /* audio unavailable */ }
}

function playMp3(name: string, volume: number) {
  if (volume <= 0) return
  const a = new Audio(`/static/audio/${name}.mp3`)
  a.volume = Math.min(1, volume)
  a.play().catch(() => {})
}

export function useAudio() {
  const rh = useRH()
  const { lang } = useI18n()

  function save() {
    for (const [k, v] of Object.entries(settings)) {
      try {
        localStorage.setItem('rotorhazard.' + k, JSON.stringify(v))
      } catch { /* ignore */ }
    }
  }

  function reset() {
    Object.assign(settings, AUDIO_DEFAULTS)
    save()
  }

  /** translate for speech (voice language can differ from the UI language) */
  function tl(text: string) {
    const l = settings.voice_string_language === 'match-timer' ? lang.value : settings.voice_string_language
    return (l && rh.state.all_languages?.languages?.[l]?.values?.[text]) || text
  }

  function voices() {
    return typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []
  }

  function pickVoice() {
    const all = voices()
    return all.find(v => v.name === settings.voice_language) || all.find(v => /english/i.test(v.name)) || all[0]
  }

  function speakNow(text: string) {
    if (typeof speechSynthesis === 'undefined') return
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.volume = settings.voice_volume
    u.rate = settings.voice_rate
    u.pitch = settings.voice_pitch
    speechSynthesis.speak(u)
  }

  function drain() {
    if (typeof speechSynthesis === 'undefined' || speechSynthesis.speaking || speechSynthesis.pending) return
    const item = queue.shift()
    if (!item) return
    if (item.tone === 'leader') leaderTone()
    if (item.tone === 'winner') winnerTone()
    if (item.text) speakNow(item.text)
  }

  function speak(text: string, priority = false, tone?: 'leader' | 'winner') {
    if (!settings.enabled) return
    const item = { text: stripHtml(text), tone }
    if (priority) queue.unshift(item)
    else queue.push(item)
    drain()
  }

  function leaderTone() {
    if (settings.use_mp3_tones) playMp3('leader', settings.indicator_beep_volume)
    else {
      playTone(150, 880, settings.indicator_beep_volume, 'square')
      setTimeout(() => playTone(150, 1320, settings.indicator_beep_volume, 'square'), 160)
    }
  }

  function winnerTone() {
    if (settings.use_mp3_tones) playMp3('winner', settings.indicator_beep_volume)
    else [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(160, f, settings.indicator_beep_volume, 'triangle'), i * 140))
  }

  function nodeBeep(node: number, double = false) {
    const f = NODE_TONES[node % NODE_TONES.length]!
    playTone(double ? 35 : 25, f, settings.indicator_beep_volume, double ? 'sawtooth' : 'square', 0.02)
    if (double) setTimeout(() => playTone(35, f, settings.indicator_beep_volume, 'sawtooth'), 70)
  }

  function manualLapBeep() {
    if (settings.enabled && settings.beep_manual_lap_button) playTone(60, 660, settings.indicator_beep_volume, 'square')
  }

  function unlock() {
    if (unlocked.value) return
    unlocked.value = true
    audioCtx()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(' '))
  }

  if (!started && import.meta.client) {
    started = true
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { once: true, capture: true })
    setInterval(drain, 150)

    const minLapMs = () => (rh.state.min_lap?.min_lap || 0) * 1000

    rh.on('phonetic_data', (msg: any) => {
      if (msg.node_finished && !settings.voice_if_node_finished) return
      if (!(minLapMs() < msg.raw_time)) return
      const team = !!msg.team_phonetic
      const want = (v: number) => v === 1 || (v === 2 && !team)
      const parts: string[] = []
      if (want(settings.voice_callsign)) parts.push(msg.pilot || msg.callsign || '')
      if (msg.lap && want(settings.voice_lap_count)) parts.push(`${tl('Lap')} ${msg.lap}`)
      if (want(settings.voice_lap_time)) parts.push(msg.phonetic)
      let text = parts.filter(Boolean).join(', ')
      if (team && settings.voice_team_lap_count) {
        text += settings.voice_team_lap_count === 2 && msg.team_short_phonetic ? msg.team_short_phonetic : `, ${msg.team_phonetic}`
      }
      if (!text) return
      if (msg.leader_flag) {
        if (settings.beep_race_leader_lap) speak('', false, 'leader')
        if (settings.voice_race_leader && !team) {
          setTimeout(() => calloutLeader(msg.pilot || msg.callsign, false), settings.voice_race_leader * 1000)
        }
      }
      speak(text)
    }, { global: true })
    rh.on('phonetic_leader', (msg: any) => {
      if (settings.voice_race_leader) setTimeout(() => calloutLeader(msg.pilot || msg.callsign, true), settings.voice_race_leader * 1000)
    }, { global: true })
    rh.on('phonetic_split_call', (msg: any) => {
      const m = settings.voice_split_timer
      if (!m) return
      let text = (m & 1) && msg.pilot_name ? msg.pilot_name : ''
      let sep = ' '
      if (((m & 2) && msg.split_id) || ((m & 4) && msg.split_time)) {
        text += ' ' + tl('split')
        if ((m & 2) && msg.split_id) text += ' ' + msg.split_id
        if ((m & 4) && msg.split_time) {
          text += ` ${tl('time')} ${msg.split_time}`
          sep = ', '
        }
      }
      if ((m & 4) && msg.split_speed) text += `${sep}${tl('speed')} ${msg.split_speed}`
      if (text.trim()) speak(text)
    }, { global: true })
    rh.on('phonetic_text', (msg: any) => {
      if (msg.winner_flag) {
        if (settings.beep_race_winner_declared) speak('', false, 'winner')
        winnerDeclared = true
      }
      if (msg.text && (!msg.domain || (settings as any)['voice_' + msg.domain])) speak(tl(msg.text))
    }, { global: true })
    rh.on('play_beep_tone', (msg: any) => {
      if (!settings.enabled) return
      const vol = msg.volume != null ? msg.volume / 100 : settings.voice_volume
      playTone(msg.duration || 100, msg.frequency || 880, vol, msg.toneType || 'triangle')
    }, { global: true })
    rh.on('first_pass_registered', (msg: any) => {
      if (!settings.enabled || settings.beep_crossing_exited || !settings.beep_on_first_pass_button) return
      if (settings.use_mp3_tones) playMp3('beep', settings.indicator_beep_volume)
      else nodeBeep(msg.node_index, true)
    }, { global: true })
    rh.on('node_crossing_change', (msg: any) => {
      if (!settings.enabled) return
      if (msg.crossing_flag && settings.beep_crossing_entered) {
        if (settings.use_mp3_tones) playMp3('enter', settings.indicator_beep_volume)
        else nodeBeep(msg.node_index)
      } else if (!msg.crossing_flag && settings.beep_crossing_exited) {
        if (settings.use_mp3_tones) playMp3('exit', settings.indicator_beep_volume)
        else nodeBeep(msg.node_index, true)
      }
    }, { global: true })
    rh.on('cluster_connect_change', (msg: any) => {
      if (!settings.enabled || !settings.beep_cluster_connect) return
      if (settings.use_mp3_tones) playMp3(msg.connect_flag ? 'cconnect' : 'cdisconnect', settings.indicator_beep_volume)
      else {
        const [a, b] = msg.connect_flag ? [440, 660] : [660, 440]
        playTone(120, a, settings.indicator_beep_volume)
        setTimeout(() => playTone(120, b, settings.indicator_beep_volume), 130)
      }
    }, { global: true })
    rh.on('stage_ready', () => { winnerDeclared = false }, { global: true })

    // race clock tones and callouts
    const { onTick } = useRaceClock()
    onTick((evt, info) => {
      if (!settings.enabled) return
      const vol = settings.tone_volume
      if (evt === 'stage_beep') settings.use_mp3_tones ? playMp3('stage', vol) : playTone(100, 440, vol)
      else if (evt === 'start') settings.use_mp3_tones ? playMp3('buzzer', vol) : playTone(700, 880, vol, 'triangle', 0.25)
      else if (evt === 'final_beep') playTone(100, 440, vol)
      else if (evt === 'expire') settings.use_mp3_tones ? playMp3('buzzer', vol) : playTone(700, 880, vol, 'triangle', 0.25)
      else if (evt === 'remaining' && settings.voice_race_timer) {
        const s = info as number
        if (s === 10) speak(tl('10 Seconds'), true)
        else if (s === 30) speak(tl('30 Seconds'), true)
        else if (s === 60) speak(tl('1 Minute'), true)
        else if (s === 1800) speak(tl('30 Minutes'), true)
        else if (s === 3600) speak(tl('1 Hour'), true)
        else if (s >= 120 && s <= 300) speak(`${s / 60} ${tl('Minutes')}`, true)
      }
    }, { global: true })
  }

  function calloutLeader(name: string, separate: boolean) {
    if (winnerDeclared) return
    speak(`${name} ${tl('is leading')}`, separate)
    if (separate && settings.beep_race_leader_lap) speak('', true, 'leader')
  }

  function test() {
    unlock()
    speakNow(tl('Race audio is on'))
  }

  return { settings, save, reset, voices, speak, test, unlocked, unlock, manualLapBeep, playTone }
}
