// Web Audio fakes for tests.
//
// - `createFakeAudioContext()` records every node a sound recipe or the audio engine creates:
//   oscillators (type, frequency values), gains, biquad filters, buffers and buffer sources,
//   `start`/`stop`, `connect`/`disconnect`, AudioParam automation, and the context's
//   `suspend`/`resume`/`close`. It throws where a browser would (start twice, stop before start,
//   exponential ramp to 0, non-finite values, cross-context connect), so recipe bugs show up in
//   tests instead of in the browser console.
// - `createFakeAudioEngine()` has the `AudioEngine` method names and logs `play(recipe,
//   duration)`, voice `stop()` / `fadeOut()` and `setMix()` calls. It is typed structurally, so
//   it compiles before `src/core/audio.ts` exists and stays assignable to `AudioEngine` once it
//   does. Option `fades: 'manual'` keeps a fading voice active until `finishFades()`.
//
// Pass the fake to code under test with `fake.asAudioContext()` and `fake.asDestination()`.

type Listener = (event: Event) => void;

function invalidState(message: string): DOMException {
  return new DOMException(message, 'InvalidStateError');
}

function requireFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${what} must be finite, got ${value}`);
}

function requireTime(time: number, what: string): void {
  requireFinite(time, what);
  if (time < 0) throw new RangeError(`${what} must be ≥ 0, got ${time}`);
}

// ---------------------------------------------------------------------------------------------
// AudioParam

export type ParamEvent =
  | { readonly type: 'value'; readonly value: number }
  | {
      readonly type: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
      readonly value: number;
      readonly time: number;
    }
  | { readonly type: 'setTargetAtTime'; readonly value: number; readonly time: number; readonly timeConstant: number }
  | { readonly type: 'setValueCurveAtTime'; readonly values: readonly number[]; readonly time: number; readonly duration: number }
  | { readonly type: 'cancelScheduledValues' | 'cancelAndHoldAtTime'; readonly time: number };

const FLOAT_MAX = 3.4028234663852886e38;

export class FakeAudioParam {
  /** Every assignment and automation call, in call order. */
  readonly events: ParamEvent[] = [];
  /** Nodes connected into this param (e.g. an LFO into a gain). */
  readonly inputs: FakeAudioNode[] = [];
  readonly automationRate: AutomationRate = 'a-rate';
  private last: number;

  constructor(
    readonly context: FakeAudioContext,
    readonly name: string,
    readonly defaultValue: number,
    readonly minValue = -FLOAT_MAX,
    readonly maxValue = FLOAT_MAX,
  ) {
    this.last = defaultValue;
  }

  /**
   * Approximation of the intrinsic value: the last value set by assignment or by any automation
   * call (ramp targets included). There is no timeline evaluation.
   */
  get value(): number {
    return this.last;
  }

  set value(value: number) {
    requireFinite(value, `${this.name}.value`);
    this.events.push({ type: 'value', value });
    this.last = value;
  }

  setValueAtTime(value: number, time: number): this {
    return this.schedule('setValueAtTime', value, time);
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.schedule('linearRampToValueAtTime', value, time);
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value === 0) throw new RangeError(`${this.name}: exponential ramp target must not be 0`);
    return this.schedule('exponentialRampToValueAtTime', value, time);
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    requireFinite(value, `${this.name} target`);
    requireTime(time, `${this.name} startTime`);
    requireTime(timeConstant, `${this.name} timeConstant`);
    this.events.push({ type: 'setTargetAtTime', value, time, timeConstant });
    this.last = value;
    return this;
  }

  setValueCurveAtTime(values: Iterable<number>, time: number, duration: number): this {
    const list = [...values];
    if (list.length < 2) throw invalidState(`${this.name}: a value curve needs at least 2 values`);
    list.forEach((v) => requireFinite(v, `${this.name} curve value`));
    requireTime(time, `${this.name} startTime`);
    requireFinite(duration, `${this.name} duration`);
    if (duration <= 0) throw new RangeError(`${this.name}: curve duration must be > 0`);
    this.events.push({ type: 'setValueCurveAtTime', values: list, time, duration });
    this.last = list[list.length - 1] ?? this.last;
    return this;
  }

  cancelScheduledValues(time: number): this {
    requireTime(time, `${this.name} cancelTime`);
    this.events.push({ type: 'cancelScheduledValues', time });
    return this;
  }

  cancelAndHoldAtTime(time: number): this {
    requireTime(time, `${this.name} cancelTime`);
    this.events.push({ type: 'cancelAndHoldAtTime', time });
    return this;
  }

  /** Every value this param was given, in call order (assignments, automation targets, curves). */
  valuesSet(): number[] {
    const out: number[] = [];
    for (const e of this.events) {
      if (e.type === 'setValueCurveAtTime') out.push(...e.values);
      else if ('value' in e) out.push(e.value);
    }
    return out;
  }

  private schedule(
    type: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime',
    value: number,
    time: number,
  ): this {
    requireFinite(value, `${this.name} value`);
    requireTime(time, `${this.name} time`);
    this.events.push({ type, value, time });
    this.last = value;
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Nodes

export type FakeNodeKind = 'destination' | 'oscillator' | 'gain' | 'biquadFilter' | 'bufferSource' | 'compressor';

export class FakeAudioNode extends EventTarget {
  /** Current outgoing connections, in connect order. */
  readonly outputs: Array<FakeAudioNode | FakeAudioParam> = [];
  /** Nodes currently connected into this one. */
  readonly inputs: FakeAudioNode[] = [];
  /** How many times `disconnect` was called. */
  disconnectCount = 0;
  channelCount = 2;
  channelCountMode: ChannelCountMode = 'max';
  channelInterpretation: ChannelInterpretation = 'speakers';

  constructor(
    readonly context: FakeAudioContext,
    readonly kind: FakeNodeKind,
    readonly numberOfInputs: number,
    readonly numberOfOutputs: number,
  ) {
    super();
  }

  connect<T extends FakeAudioNode>(destination: T, output?: number, input?: number): T;
  connect(destination: FakeAudioParam, output?: number): void;
  connect(destination: FakeAudioNode | FakeAudioParam): FakeAudioNode | void {
    if (!(destination instanceof FakeAudioNode) && !(destination instanceof FakeAudioParam)) {
      throw new TypeError(`${this.kind}.connect: destination is not a fake AudioNode or AudioParam`);
    }
    if (destination.context !== this.context) {
      throw new DOMException(`${this.kind}.connect: destination belongs to another context`, 'InvalidAccessError');
    }
    if (this.numberOfOutputs === 0) {
      throw new DOMException(`${this.kind} has no outputs`, 'IndexSizeError');
    }
    if (!this.outputs.includes(destination)) {
      this.outputs.push(destination);
      destination.inputs.push(this);
    }
    return destination instanceof FakeAudioNode ? destination : undefined;
  }

  /** With no argument, drops every outgoing connection; otherwise only the one to `destination`. */
  disconnect(destination?: FakeAudioNode | FakeAudioParam): void {
    this.disconnectCount += 1;
    const targets = destination === undefined ? [...this.outputs] : [destination];
    for (const target of targets) {
      const i = this.outputs.indexOf(target);
      if (i < 0) {
        throw new DOMException(`${this.kind}.disconnect: not connected to that destination`, 'InvalidAccessError');
      }
      this.outputs.splice(i, 1);
      const j = target.inputs.indexOf(this);
      if (j >= 0) target.inputs.splice(j, 1);
    }
  }

  /** True if a chain of connections leads from this node to `target` (node or param). */
  reaches(target: FakeAudioNode | FakeAudioParam): boolean {
    const seen = new Set<FakeAudioNode>();
    const visit = (node: FakeAudioNode): boolean => {
      if (seen.has(node)) return false;
      seen.add(node);
      return node.outputs.some((out) => out === target || (out instanceof FakeAudioNode && visit(out)));
    };
    return visit(this);
  }
}

export class FakeDestinationNode extends FakeAudioNode {
  readonly maxChannelCount = 2;
  constructor(context: FakeAudioContext) {
    super(context, 'destination', 1, 0);
  }
}

/** Shared start/stop/ended behaviour of oscillators and buffer sources. */
export class FakeScheduledSourceNode extends FakeAudioNode {
  readonly startTimes: number[] = [];
  readonly stopTimes: number[] = [];
  onended: Listener | null = null;

  get started(): boolean {
    return this.startTimes.length > 0;
  }

  get stopped(): boolean {
    return this.stopTimes.length > 0;
  }

  start(when = 0): void {
    requireTime(when, `${this.kind}.start when`);
    if (this.started) throw invalidState(`${this.kind}.start called twice`);
    this.startTimes.push(when);
  }

  stop(when = 0): void {
    requireTime(when, `${this.kind}.stop when`);
    if (!this.started) throw invalidState(`${this.kind}.stop called before start`);
    this.stopTimes.push(when);
  }

  /** Test control: fire `ended` as the browser would once playback finishes. */
  end(): void {
    const event = new Event('ended');
    this.onended?.(event);
    this.dispatchEvent(event);
  }
}

const OSC_TYPES: readonly OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];

export class FakeOscillatorNode extends FakeScheduledSourceNode {
  readonly frequency: FakeAudioParam;
  readonly detune: FakeAudioParam;
  /** Every type assigned, in order (the initial 'sine' is not included). */
  readonly typesSet: OscillatorType[] = [];
  private currentType: OscillatorType = 'sine';

  constructor(context: FakeAudioContext) {
    super(context, 'oscillator', 0, 1);
    const nyquist = context.sampleRate / 2;
    this.frequency = new FakeAudioParam(context, 'frequency', 440, -nyquist, nyquist);
    this.detune = new FakeAudioParam(context, 'detune', 0);
  }

  get type(): OscillatorType {
    return this.currentType;
  }

  set type(type: OscillatorType) {
    if (type === 'custom') throw invalidState("oscillator type 'custom' needs setPeriodicWave()");
    if (!OSC_TYPES.includes(type)) throw new TypeError(`unknown oscillator type ${String(type)}`);
    this.currentType = type;
    this.typesSet.push(type);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain: FakeAudioParam;
  constructor(context: FakeAudioContext) {
    super(context, 'gain', 1, 1);
    this.gain = new FakeAudioParam(context, 'gain', 1);
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency: FakeAudioParam;
  readonly Q: FakeAudioParam;
  readonly gain: FakeAudioParam;
  readonly detune: FakeAudioParam;
  constructor(context: FakeAudioContext) {
    super(context, 'biquadFilter', 1, 1);
    this.frequency = new FakeAudioParam(context, 'frequency', 350, 0, context.sampleRate / 2);
    this.Q = new FakeAudioParam(context, 'Q', 1);
    this.gain = new FakeAudioParam(context, 'gain', 0);
    this.detune = new FakeAudioParam(context, 'detune', 0);
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold: FakeAudioParam;
  readonly knee: FakeAudioParam;
  readonly ratio: FakeAudioParam;
  readonly attack: FakeAudioParam;
  readonly release: FakeAudioParam;
  readonly reduction = 0;
  constructor(context: FakeAudioContext) {
    super(context, 'compressor', 1, 1);
    this.threshold = new FakeAudioParam(context, 'threshold', -24, -100, 0);
    this.knee = new FakeAudioParam(context, 'knee', 30, 0, 40);
    this.ratio = new FakeAudioParam(context, 'ratio', 12, 1, 20);
    this.attack = new FakeAudioParam(context, 'attack', 0.003, 0, 1);
    this.release = new FakeAudioParam(context, 'release', 0.25, 0, 1);
  }
}

export class FakeAudioBuffer {
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    if (!Number.isInteger(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > 32) {
      throw new DOMException(`createBuffer: bad channel count ${numberOfChannels}`, 'NotSupportedError');
    }
    if (!Number.isInteger(length) || length < 1) {
      throw new DOMException(`createBuffer: bad length ${length}`, 'NotSupportedError');
    }
    if (!(sampleRate >= 3000 && sampleRate <= 768000)) {
      throw new DOMException(`createBuffer: bad sample rate ${sampleRate}`, 'NotSupportedError');
    }
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new DOMException(`getChannelData: no channel ${channel}`, 'IndexSizeError');
    return data;
  }
}

export class FakeAudioBufferSourceNode extends FakeScheduledSourceNode {
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate: FakeAudioParam;
  readonly detune: FakeAudioParam;
  /** `offset` and `duration` passed to `start`, if any. */
  startOffset: number | undefined;
  startDuration: number | undefined;
  private currentBuffer: FakeAudioBuffer | null = null;

  constructor(context: FakeAudioContext) {
    super(context, 'bufferSource', 0, 1);
    this.playbackRate = new FakeAudioParam(context, 'playbackRate', 1);
    this.detune = new FakeAudioParam(context, 'detune', 0);
  }

  get buffer(): FakeAudioBuffer | null {
    return this.currentBuffer;
  }

  set buffer(buffer: FakeAudioBuffer | null) {
    if (buffer !== null && this.currentBuffer !== null) throw invalidState('buffer can only be set once');
    this.currentBuffer = buffer;
  }

  override start(when = 0, offset?: number, duration?: number): void {
    super.start(when);
    if (offset !== undefined) requireTime(offset, 'bufferSource.start offset');
    if (duration !== undefined) requireTime(duration, 'bufferSource.start duration');
    this.startOffset = offset;
    this.startDuration = duration;
  }
}

// ---------------------------------------------------------------------------------------------
// Context

export type ContextCall = 'suspend' | 'resume' | 'close';

export interface FakeAudioContextOptions {
  /** Initial state. Browsers start a context `suspended` outside a user gesture. Default `suspended`. */
  readonly state?: AudioContextState;
  readonly sampleRate?: number;
  readonly currentTime?: number;
  /** Make `resume()` reject (with this error, or a NotAllowedError for `true`). */
  readonly resumeRejects?: boolean | Error;
}

export class FakeAudioContext extends EventTarget {
  readonly sampleRate: number;
  readonly destination: FakeDestinationNode;
  /** Context clock in seconds. Tests may set it or use `advance()`. */
  currentTime: number;
  /** `suspend`/`resume`/`close` calls, in order. */
  readonly calls: ContextCall[] = [];
  onstatechange: Listener | null = null;

  /** Every node created by `create*`, in creation order (destination not included). */
  readonly nodes: FakeAudioNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  readonly compressors: FakeDynamicsCompressorNode[] = [];

  private currentState: AudioContextState;
  private readonly resumeRejects: boolean | Error;

  constructor(options: FakeAudioContextOptions = {}) {
    super();
    this.sampleRate = options.sampleRate ?? 44100;
    this.currentTime = options.currentTime ?? 0;
    this.currentState = options.state ?? 'suspended';
    this.resumeRejects = options.resumeRejects ?? false;
    this.destination = new FakeDestinationNode(this);
  }

  get state(): AudioContextState {
    return this.currentState;
  }

  /** Move the clock forward by `seconds`. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  /** The fake typed as a real context, for code under test. */
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }

  /** The destination typed as a real AudioNode, for a recipe's `out` argument. */
  asDestination(): AudioNode {
    return this.destination as unknown as AudioNode;
  }

  resume(): Promise<void> {
    this.calls.push('resume');
    if (this.currentState === 'closed') return Promise.reject(invalidState('resume on a closed context'));
    if (this.resumeRejects) {
      const error =
        this.resumeRejects instanceof Error
          ? this.resumeRejects
          : new DOMException('resume not allowed', 'NotAllowedError');
      return Promise.reject(error);
    }
    this.setState('running');
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.calls.push('suspend');
    if (this.currentState === 'closed') return Promise.reject(invalidState('suspend on a closed context'));
    this.setState('suspended');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.calls.push('close');
    if (this.currentState === 'closed') return Promise.reject(invalidState('close on a closed context'));
    this.setState('closed');
    return Promise.resolve();
  }

  createOscillator(): FakeOscillatorNode {
    return this.track(new FakeOscillatorNode(this), this.oscillators);
  }

  createGain(): FakeGainNode {
    return this.track(new FakeGainNode(this), this.gains);
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return this.track(new FakeBiquadFilterNode(this), this.filters);
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    return this.track(new FakeAudioBufferSourceNode(this), this.bufferSources);
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return this.track(new FakeDynamicsCompressorNode(this), this.compressors);
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  /** Oscillators and buffer sources, in creation order. */
  sources(): FakeScheduledSourceNode[] {
    return this.nodes.filter((n): n is FakeScheduledSourceNode => n instanceof FakeScheduledSourceNode);
  }

  /** Sources that were started and never stopped. Empty after a recipe's stop function ran. */
  unstopped(): FakeScheduledSourceNode[] {
    return this.sources().filter((s) => s.started && !s.stopped);
  }

  private track<T extends FakeAudioNode>(node: T, list: T[]): T {
    this.nodes.push(node);
    list.push(node);
    return node;
  }

  private setState(state: AudioContextState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    const event = new Event('statechange');
    this.onstatechange?.(event);
    this.dispatchEvent(event);
  }
}

export function createFakeAudioContext(options: FakeAudioContextOptions = {}): FakeAudioContext {
  return new FakeAudioContext(options);
}

// ---------------------------------------------------------------------------------------------
// Fake engine

/** Structural copy of `SoundRecipe` from `src/core/audio.ts`. */
export type FakeSoundRecipe = (ac: BaseAudioContext, out: AudioNode, at: number, durationSec: number) => () => void;

/** Structural copy of `Channel` from `src/core/audio.ts`. */
export type FakeChannel = 'music' | 'sfx';

/** Structural copy of `AudioMix` from `src/core/audio.ts`. */
export interface FakeAudioMix {
  readonly volume: number;
  readonly music: boolean;
  readonly sfx: boolean;
}

export interface FakeVoice {
  readonly id: number;
  /** `recipe.name` (named consts and object-literal properties give a useful name). */
  readonly name: string;
  readonly recipe: FakeSoundRecipe;
  readonly durationSec: number;
  /** The channel passed to `play`, `'sfx'` when none was given. */
  readonly channel: FakeChannel;
  /** Whether the engine was unlocked when `play` was called. */
  readonly unlocked: boolean;
  stop(): void;
  /**
   * Logged on every call. Ignored when stopped or already fading; a non-positive or non-finite
   * duration stops at once. Otherwise stops at once with `fades: 'instant'`, or waits for
   * `finishFades()` with `fades: 'manual'`.
   */
  fadeOut(durationSec: number): void;
  stopped(): boolean;
  /** True while a manual fade waits for `finishFades()`. */
  fading(): boolean;
}

export type EngineLogEntry =
  | { readonly type: 'unlock'; readonly result: boolean }
  | { readonly type: 'play'; readonly id: number; readonly name: string; readonly recipe: FakeSoundRecipe; readonly durationSec: number }
  | { readonly type: 'stop'; readonly id: number; readonly name: string }
  | { readonly type: 'fadeOut'; readonly id: number; readonly name: string; readonly durationSec: number }
  | { readonly type: 'setMuted'; readonly muted: boolean }
  | { readonly type: 'setMix'; readonly mix: FakeAudioMix }
  | { readonly type: 'stopAll' }
  | { readonly type: 'unmount' };

export interface FakeAudioEngineOptions {
  /** Start unlocked. Default true, since most scene tests start after the power-on click. */
  readonly unlocked?: boolean;
  /** What `unlock()` returns (false = audio unavailable; the engine stays locked). Default true. */
  readonly available?: boolean;
  /**
   * `'instant'` (default): `fadeOut` stops the voice at once, so shell-flow assertions about
   * active voices hold. `'manual'`: a fading voice stays active until `finishFades()`.
   */
  readonly fades?: 'instant' | 'manual';
}

export interface FakeAudioEngine {
  // AudioEngine methods
  unlock(): boolean;
  isUnlocked(): boolean;
  play(recipe: FakeSoundRecipe, durationSec: number, channel?: FakeChannel, options?: { readonly keep?: boolean }): FakeVoice;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  setMix(mix: FakeAudioMix): void;
  mix(): FakeAudioMix;
  stopAll(): void;
  unmount(): void;
  // Test inspection
  /** Every call above, in order. A voice `stop()` is logged on each call, repeats included. */
  readonly log: readonly EngineLogEntry[];
  /** Every voice returned by `play`, in order. */
  readonly voices: readonly FakeVoice[];
  /** Names of every played recipe, in order. */
  played(): string[];
  /** Voices that were played and not stopped yet. */
  activeVoices(): FakeVoice[];
  /** Ends every pending manual fade by stopping its voice. */
  finishFades(): void;
}

export function createFakeAudioEngine(options: FakeAudioEngineOptions = {}): FakeAudioEngine {
  const available = options.available ?? true;
  const fadeMode = options.fades ?? 'instant';
  let unlocked = options.unlocked ?? true;
  let muted = false;
  let currentMix: FakeAudioMix = Object.freeze({ volume: 100, music: true, sfx: true });
  const log: EngineLogEntry[] = [];
  const voices: FakeVoice[] = [];

  const play = (recipe: FakeSoundRecipe, durationSec: number, channel: FakeChannel = 'sfx'): FakeVoice => {
    const id = voices.length;
    const name = recipe.name || '(anonymous)';
    let isStopped = false;
    let isFading = false;
    const voice: FakeVoice = {
      id,
      name,
      recipe,
      durationSec,
      channel,
      unlocked,
      stop() {
        log.push({ type: 'stop', id, name });
        isStopped = true;
        isFading = false;
      },
      fadeOut(fadeSec) {
        log.push({ type: 'fadeOut', id, name, durationSec: fadeSec });
        if (isStopped || isFading) return;
        if (!(Number.isFinite(fadeSec) && fadeSec > 0) || fadeMode === 'instant') {
          voice.stop();
          return;
        }
        isFading = true;
      },
      stopped: () => isStopped,
      fading: () => isFading,
    };
    voices.push(voice);
    log.push({ type: 'play', id, name, recipe, durationSec });
    return voice;
  };

  const activeVoices = (): FakeVoice[] => voices.filter((v) => !v.stopped());

  return {
    unlock() {
      log.push({ type: 'unlock', result: available });
      if (available) unlocked = true;
      return available;
    },
    isUnlocked: () => unlocked,
    play,
    setMuted(value) {
      log.push({ type: 'setMuted', muted: value });
      muted = value;
    },
    isMuted: () => muted,
    setMix(mix) {
      currentMix = Object.freeze({ volume: mix.volume, music: mix.music, sfx: mix.sfx });
      log.push({ type: 'setMix', mix: currentMix });
    },
    mix: () => currentMix,
    stopAll() {
      log.push({ type: 'stopAll' });
      activeVoices().forEach((v) => v.stop());
    },
    unmount() {
      log.push({ type: 'unmount' });
      activeVoices().forEach((v) => v.stop());
    },
    log,
    voices,
    played: () => voices.map((v) => v.name),
    activeVoices,
    finishFades() {
      voices.filter((v) => v.fading()).forEach((v) => v.stop());
    },
  };
}
