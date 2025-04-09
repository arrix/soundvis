export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private microphoneStream: MediaStream | null = null;
  private oscillator: OscillatorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private connectedAudioElement: HTMLAudioElement | null = null;

  constructor() {
    // Don't initialize the audio context in the constructor
    // It should be initialized on user interaction
  }

  private initAudioContext() {
    try {
      // Create a new AudioContext only if it doesn't exist or is closed
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log("AudioContext created with state:", this.audioContext.state);
      }
      
      // If the context is suspended, try to resume it immediately
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.log("Attempting to resume suspended AudioContext");
        this.audioContext.resume().then(() => {
          if (this.audioContext) {
            console.log("AudioContext resumed successfully, new state:", this.audioContext.state);
          }
        }).catch(err => {
          console.error("Failed to resume AudioContext:", err);
        });
      }
      
      this.analyser = this.audioContext.createAnalyser();
      // Increase FFT size for better frequency resolution
      this.analyser.fftSize = 2048; // Increase FFT size for better resolution
      // Make the smoothing less aggressive for more responsive visuals
      this.analyser.smoothingTimeConstant = 0.5; // Moderate value for balance
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      
      console.log("Audio analyzer created with frequencyBinCount:", this.analyser.frequencyBinCount);
      return true;
    } catch (error) {
      console.error('Error initializing audio context:', error);
      return false;
    }
  }

  public async requestMicrophoneAccess(): Promise<boolean> {
    try {
      // First initialize the audio context (which requires user interaction)
      if (!this.initAudioContext()) {
        console.error("Failed to initialize AudioContext");
        return false;
      }
      
      console.log("Requesting microphone access...");
      
      // Then request microphone access with appropriate constraints for better audio quality
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true, // Changed to true for better results in most browsers
          autoGainControl: true,  // Changed to true to help with low volume inputs
          noiseSuppression: false // Keep false for raw audio data
        } 
      });
      
      // Log information about the tracks we've received
      const audioTracks = this.microphoneStream.getAudioTracks();
      console.log(`Got ${audioTracks.length} audio tracks`);
      audioTracks.forEach((track, i) => {
        console.log(`Track ${i}: label="${track.label}", enabled=${track.enabled}, muted=${track.muted}, readyState="${track.readyState}"`);
        console.log(`Track ${i} settings:`, track.getSettings());
      });
      
      if (!this.audioContext) {
        console.error("AudioContext is null despite successful initialization");
        return false;
      }
      
      // Ensure the context is running before connecting sources
      if (this.audioContext.state !== 'running') {
        console.log("AudioContext not running, attempting to resume...");
        await this.audioContext.resume();
        console.log("AudioContext state after resume:", this.audioContext.state);
      }
      
      if (this.audioContext && this.analyser) {
        // Clean up any previous source to avoid duplicate connections
        if (this.sourceNode) {
          this.sourceNode.disconnect();
        }
        
        // Create and store the source node
        this.sourceNode = this.audioContext.createMediaStreamSource(this.microphoneStream);
        
        // Connect the source to analyzer
        this.sourceNode.connect(this.analyser);
        
        console.log("Microphone connected successfully to audio analyzer");
        
        // Set up a diagnostic interval to regularly check audio levels
        const diagnosticInterval = setInterval(() => {
          if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            const sum = this.dataArray.reduce((a, b) => a + b, 0);
            const max = Math.max(...this.dataArray);
            console.log(`[DIAGNOSTIC] Audio levels - Sum: ${sum}, Max: ${max}, Avg: ${sum/this.dataArray.length}`);
            
            // If we're not seeing any signal after 3 seconds, clear the interval
            if (sum === 0) {
              console.warn("No audio signal detected - microphone may not be capturing");
            } else {
              // If we get signal, we don't need the diagnostic anymore
              clearInterval(diagnosticInterval);
            }
          }
        }, 1000);
        
        // Only run the diagnostic for a few seconds
        setTimeout(() => {
          clearInterval(diagnosticInterval);
        }, 5000);
        
        // Verify we're getting data
        this.analyser.getByteFrequencyData(this.dataArray!);
        const sum = this.dataArray!.reduce((a, b) => a + b, 0);
        const max = Math.max(...this.dataArray!);
        console.log("Initial frequency data sample:", this.dataArray!.slice(0, 10));
        console.log("Initial audio stats - Total energy:", sum, "Max value:", max);
        
        return true;
      }
      console.error("AudioContext or Analyzer unavailable after initialization");
      return false;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }

  public getFrequencyData(): Uint8Array | null {
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      return this.dataArray;
    }
    return null;
  }

  public getRawVolume(): number {
    if (!this.analyser || !this.dataArray) {
      console.log("Analyzer or data array not available for volume calculation");
      return 0;
    }
    
    try {
      // Get time domain data to better measure volume
      const timeDomainData = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(timeDomainData);
      
      // Calculate RMS (root mean square) volume
      let sumOfSquares = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        // Normalize to [-1, 1]
        const amplitude = (timeDomainData[i] / 128) - 1;
        sumOfSquares += amplitude * amplitude;
      }
      
      const rms = Math.sqrt(sumOfSquares / timeDomainData.length);
      
      // If volume is very low
      // something might be wrong with the connection
      if (rms < 0.001) {
        console.log("Very low volume detected with audio source. Connection might need refreshing.");
      }
      
      return rms;
    } catch (error) {
      console.error("Error calculating raw volume:", error);
      return 0;
    }
  }

  public getFrequencyBands(): number[] {
    if (!this.dataArray || !this.analyser) return Array(8).fill(0); // Return empty bands if no data
    
    // Make sure we're getting fresh data
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate sum to detect if we're receiving any signal
    const sum = this.dataArray.reduce((acc, val) => acc + val, 0);
    // console.log('Total audio energy:', sum, 'Average:', sum / this.dataArray.length);
    
    // Log first 20 values and some values from middle of spectrum to debug
    // console.log('First 20 frequency bins:', Array.from(this.dataArray.slice(0, 20)));
    // console.log('Mid-range frequency bins:', Array.from(this.dataArray.slice(100, 120)));
    
    // Check if we have a valid audio signal - this is crucial
    const hasSignal = sum > 0;
    // console.log('Has signal:', hasSignal);
    
    // Use a more focused frequency range - human voice is typically 80Hz-255Hz (fundamental)
    // and we want to capture a good portion of the spectrum for music/environmental sounds
    const startBin = 1;  // Skip DC offset (0 Hz)
    const endBin = Math.min(800, this.dataArray.length); // Adjusted range
    const usefulRange = this.dataArray.slice(startBin, endBin);
    
    // Divide into 8 bands with logarithmic spacing to better match human hearing perception
    const bands: number[] = [];
    const totalBands = 8;
    
    if (hasSignal) {
      // Use logarithmic band distribution for more natural frequency response
      const logSpace = (start: number, end: number, n: number) => {
        const result = [];
        const logStart = Math.log(start);
        const logEnd = Math.log(end);
        const delta = (logEnd - logStart) / (n - 1);
        
        for (let i = 0; i < n; i++) {
          result.push(Math.round(Math.exp(logStart + delta * i)));
        }
        
        return result;
      };
      
      // Create logarithmically spaced frequency band boundaries
      const bandBoundaries = logSpace(startBin, endBin, totalBands + 1);
      
      // Process each band
      for (let i = 0; i < totalBands; i++) {
        const startIndex = bandBoundaries[i];
        const endIndex = bandBoundaries[i + 1];
        
        // Extract the frequency range for this band
        const bandData = usefulRange.slice(startIndex - startBin, endIndex - startBin);
        
        // Use peak value for more dynamic visualization
      let bandValue = 0;
      if (bandData.length > 0) {
          // Find the peak value in this band
        bandValue = Math.max(...bandData);
        
        //   // Apply amplification that increases for higher frequencies (often quieter)
        //   // This helps balance the visualization across the spectrum
        //   const amplification = 2.0 + (i / totalBands) * 2.0;
        
        //   // Apply mild non-linear scaling to make quieter sounds more visible
        //   // while preserving some dynamic range
        //   bandValue = Math.pow(bandValue / 255, 0.7) * 255;
        
        //   // Apply amplification with maximum limit
        // bandValue = Math.min(255, bandValue * amplification);
      }
      
      bands.push(bandValue);
    }
    } else {
      // If no signal, return zeros
      return Array(totalBands).fill(0);
    }
    
    // Apply temporal smoothing to reduce jitter
    // This would be handled by class variables in a production environment
    
    // Log the final band values
    // console.log('Final processed bands:', bands);
    
    return bands;
  }

  // Add a method to create synthetic test sound
  public async createTestTone(): Promise<boolean> {
    try {
      // First initialize the audio context
      if (!this.initAudioContext()) {
        console.error("Failed to initialize AudioContext for test tone");
        return false;
      }
      
      if (!this.audioContext || !this.analyser) {
        console.error("AudioContext or Analyzer not available for test tone");
        return false;
      }
      
      // Ensure the context is running
      if (this.audioContext.state !== 'running') {
        console.log("AudioContext not running, attempting to resume for test tone...");
        await this.audioContext.resume();
      }
      
      // Disconnect any previous connections
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
        this.oscillator = null;
      }
        
        // Create an oscillator bank for richer test sound
        const oscillators: OscillatorNode[] = [];
        const baseFrequency = 220; // A3 note
        
        // Create multiple oscillators at different frequencies for a richer sound
        const frequencies = [
          baseFrequency,         // fundamental
          baseFrequency * 2,     // octave
          baseFrequency * 3,     // perfect fifth + octave
          baseFrequency * 4      // two octaves
        ];
        
        // Create a gain node to control volume
        const masterGain = this.audioContext.createGain();
        masterGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        masterGain.connect(this.analyser);
        
        // Create LFO for amplitude modulation
        const lfo = this.audioContext.createOscillator();
        lfo.frequency.setValueAtTime(2, this.audioContext.currentTime); // 2 Hz modulation
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(masterGain.gain);
        lfo.start();
        
        // Create each oscillator
        for (let i = 0; i < frequencies.length; i++) {
          const osc = this.audioContext.createOscillator();
          osc.type = i === 0 ? 'sawtooth' : 'triangle'; // Fundamental as sawtooth, harmonics as triangle
          osc.frequency.setValueAtTime(frequencies[i], this.audioContext.currentTime);
          
          // Individual gain for each oscillator (decreasing volume for higher harmonics)
          const gain = this.audioContext.createGain();
          gain.gain.setValueAtTime(1.0 / (i + 1), this.audioContext.currentTime);
          
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start();
          oscillators.push(osc);
        }
        
        // Store the main oscillator for cleanup
        this.oscillator = oscillators[0];
        
        console.log("Enhanced test tone generator started");
        
        // Immediately get frequency data to verify it's working
        setTimeout(() => {
          if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            console.log("Test tone frequency data:", Array.from(this.dataArray.slice(0, 50)));
            const sum = this.dataArray.reduce((a, b) => a + b, 0);
            console.log("Test tone total energy:", sum);
          }
        }, 500);
        
        return true;
    } catch (error) {
      console.error('Error creating test tone:', error);
      return false;
    }
  }

  // Connect an audio element to the analyzer
  public async connectAudioElement(audioElement: HTMLAudioElement): Promise<boolean> {
    try {
      // First initialize the audio context
      if (!this.initAudioContext()) {
        console.error("Failed to initialize AudioContext for audio element");
        return false;
      }
      
      if (!this.audioContext || !this.analyser) {
        console.error("AudioContext or Analyzer not available for audio element");
        return false;
      }
      
      // Ensure the context is running
      if (this.audioContext.state !== 'running') {
        console.log("AudioContext not running, attempting to resume for audio element...");
        await this.audioContext.resume();
      }
      
      // Check if we're trying to reconnect the same element
      if (this.connectedAudioElement === audioElement && this.mediaElementSource) {
        console.log("Audio element already connected, reusing existing connection");
        // Just make sure it's connected to the analyzer
        this.mediaElementSource.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        return true;
      }
      
      // Create a media element source
      this.mediaElementSource = this.audioContext.createMediaElementSource(audioElement);
      
      // Connect the source to the analyzer
      this.mediaElementSource.connect(this.analyser);
      
      // Also connect the source to the destination (speakers)
      this.analyser.connect(this.audioContext.destination);
      
      // Store reference to the connected audio element
      this.connectedAudioElement = audioElement;
      
      console.log("Audio element connected to analyzer");
      
      return true;
    } catch (error) {
      console.error('Error connecting audio element:', error);
      return false;
    }
  }

  // Modify the cleanup method to also clean up media element connections
  public cleanup() {
    // Stop microphone tracks
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => {
        try {
          track.stop();
          console.log("Microphone track stopped");
        } catch (e) {
          console.error("Error stopping microphone track:", e);
        }
      });
      this.microphoneStream = null;
    }
    
    // Stop and disconnect oscillator
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
        console.log("Oscillator stopped and disconnected");
      } catch (e) {
        console.error("Error stopping oscillator:", e);
      }
      this.oscillator = null;
    }
    
    // Disconnect source node
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        console.log("Source node disconnected");
      } catch (e) {
        console.error("Error disconnecting source node:", e);
      }
      this.sourceNode = null;
    }
    
    // Disconnect media element source
    if (this.mediaElementSource) {
      try {
        this.mediaElementSource.disconnect();
        console.log("Media element source disconnected");
      } catch (e) {
        console.error("Error disconnecting media element source:", e);
      }
      // this.mediaElementSource = null;
    }
    
    // Disconnect analyser
    if (this.analyser) {
      try {
        this.analyser.disconnect();
        console.log("Analyser disconnected");
      } catch (e) {
        console.error("Error disconnecting analyser:", e);
      }
    }
    
    // Reset flags and data
    this.dataArray = null;
    // we have to keep the connectedAudioElement because there is no way to unbind it from the audio element
    // this.connectedAudioElement = null;
    
    console.log("Audio processor cleaned up");
  }
} 