import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('sounds', () => {
  // Re-import the module fresh for each test to reset module-level state
  let sounds: typeof import('./sounds');

  let mockCtx: {
    currentTime: number;
    state: string;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    destination: object;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const mockOsc = {
      type: 'sine' as OscillatorType,
      frequency: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    mockCtx = {
      currentTime: 0,
      state: 'running',
      createOscillator: vi.fn().mockReturnValue(mockOsc),
      createGain: vi.fn().mockReturnValue(mockGain),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockCtx));
    vi.resetModules();
    sounds = await import('./sounds');
    sounds.setSoundEnabled(true);
  });

  describe('playCorrect', () => {
    it('creates an oscillator and a gain node', () => {
      sounds.playCorrect();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(1);
    });

    it('starts and schedules the oscillator to stop', () => {
      const mockOsc = mockCtx.createOscillator();
      mockCtx.createOscillator.mockReturnValue(mockOsc);
      sounds.playCorrect();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });

    it('is a no-op when sound is disabled', () => {
      sounds.setSoundEnabled(false);
      sounds.playCorrect();
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('playIncorrect', () => {
    it('creates an oscillator and a gain node', () => {
      sounds.playIncorrect();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when sound is disabled', () => {
      sounds.setSoundEnabled(false);
      sounds.playIncorrect();
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('playComplete', () => {
    it('creates 3 oscillators for the arpeggio', () => {
      sounds.playComplete();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(3);
    });

    it('is a no-op when sound is disabled', () => {
      sounds.setSoundEnabled(false);
      sounds.playComplete();
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('initAudio', () => {
    it('calls resume() when AudioContext is suspended', () => {
      mockCtx.state = 'suspended';
      sounds.initAudio();
      expect(mockCtx.resume).toHaveBeenCalledTimes(1);
    });

    it('does not call resume() when AudioContext is running', () => {
      mockCtx.state = 'running';
      sounds.initAudio();
      expect(mockCtx.resume).not.toHaveBeenCalled();
    });
  });

  describe('setSoundEnabled', () => {
    it('enabling sound allows playback', () => {
      sounds.setSoundEnabled(false);
      sounds.playCorrect();
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();

      sounds.setSoundEnabled(true);
      sounds.playCorrect();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
    });
  });
});
