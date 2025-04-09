import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { AudioProcessor } from '../utils/audioUtils';

// Cloud particle component
const CloudParticles = ({ audioData, sensitivity = 1.0 }: { audioData: number[], sensitivity?: number }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const [particles, setParticles] = useState<THREE.BufferGeometry | null>(null);
  
  // Initialize particles
  useEffect(() => {
    const particleCount = 5000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      // Random positions in a sphere
      const radius = Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Colors - blue to purple gradient
      colors[i * 3] = 0.2 + Math.random() * 0.3; // R
      colors[i * 3 + 1] = 0.1 + Math.random() * 0.2; // G
      colors[i * 3 + 2] = 0.5 + Math.random() * 0.5; // B
      
      // Varying particle sizes
      sizes[i] = Math.random() * 0.2 + 0.05;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    setParticles(geometry);
  }, []);
  
  // Animate particles based on audio data
  useFrame(({ clock }) => {
    if (!particlesRef.current || !particles) return;
    
    const positions = particles.getAttribute('position') as THREE.BufferAttribute;
    const colors = particles.getAttribute('color') as THREE.BufferAttribute;
    const sizes = particles.getAttribute('size') as THREE.BufferAttribute;
    
    // Add a breathing effect that's present even when quiet
    const time = clock.elapsedTime;
    const breathingRate = 0.15; // Slow breathing rate
    const breathingEffect = Math.sin(time * breathingRate) * 0.05; // Subtle breathing amplitude
    
    // A minimum movement factor to keep some gentle activity even when quiet
    const baseMovementFactor = 0.1 + breathingEffect;
    
    // Derive sound characteristics for directional influence
    // Use first few bands to determine low frequency intensity (bass)
    const lowFreqIntensity = sensitivity * audioData.slice(0, 2).reduce((sum, val) => sum + val, 0) / (2 * 255);
    // Use middle bands to determine mid frequency intensity
    const midFreqIntensity = sensitivity * audioData.slice(2, 5).reduce((sum, val) => sum + val, 0) / (3 * 255);
    // Use last bands to determine high frequency intensity
    const highFreqIntensity = sensitivity * audioData.slice(5).reduce((sum, val) => sum + val, 0) / (3 * 255);
    
    // Create dynamic orbital movement patterns based on frequency distribution
    // More bass = upward motion, more treble = outward motion
    const verticalBias = (lowFreqIntensity - highFreqIntensity) * 0.3;
    const radialBias = (highFreqIntensity - lowFreqIntensity) * 0.3;
    
    // Create circular motion in XZ plane that changes direction with mid frequencies
    const circularMotionSpeed = 0.05 + midFreqIntensity * 0.2;
    const circularMotionDirection = midFreqIntensity > 0.5 ? 1 : -1;
    
    for (let i = 0; i < positions.count; i++) {
      const i3 = i * 3;
      const x = positions.array[i3];
      const y = positions.array[i3 + 1];
      const z = positions.array[i3 + 2];
      
      // Calculate distance from center
      const distance = Math.sqrt(x * x + y * y + z * z);
      
      // Get the appropriate audio band based on distance
      const bandIndex = Math.min(Math.floor((distance / 20) * audioData.length), audioData.length - 1);
      const audioIntensity = sensitivity * audioData[bandIndex] / 255;
      
      // More subtle noise with less variation
      const noise = Math.sin(time * 0.2 + i * 0.005 + x * 0.05 + y * 0.05) * 0.02;
      
      // Combine gentle breathing with audio-reactive movement
      // Using cubic curve for audioIntensity to make it more responsive at higher levels
      const audioFactor = Math.pow(audioIntensity, 3) * 0.8;
      const movement = baseMovementFactor + audioFactor + noise;
      
      // Calculate movement vector with directional biases
      const direction = new THREE.Vector3(x, y, z).normalize();
      
      // Add vertical bias - particles move more upward/downward based on bass
      direction.y += verticalBias;
      
      // Add radial bias - particles move more inward/outward based on treble
      if (radialBias > 0) {
        // Move outward with high frequencies
        direction.multiplyScalar(1 + radialBias * 0.2);
      } else {
        // Move inward with low frequencies
        direction.multiplyScalar(1 / (1 - radialBias * 0.2));
      }
      
      // Apply the biased direction to movement
      positions.array[i3] += direction.x * movement * 0.05;
      positions.array[i3 + 1] += direction.y * movement * 0.05;
      positions.array[i3 + 2] += direction.z * movement * 0.05;
      
      // Apply circular motion in the XZ plane based on mid frequencies
      // This creates a swirling effect that changes direction based on sound
      if (audioIntensity > 0.1) {
        const xzDistance = Math.sqrt(x * x + z * z);
        if (xzDistance > 0.1) {
          const normalizedX = x / xzDistance;
          const normalizedZ = z / xzDistance;
          
          // Circular motion perpendicular to radius
          const circularForce = circularMotionSpeed * circularMotionDirection;
          positions.array[i3] += -normalizedZ * circularForce * movement;
          positions.array[i3 + 2] += normalizedX * circularForce * movement;
        }
      }
      
      // Add gentler rotation that scales with audio intensity
      // Base rotation is extremely slow when quiet
      const rotationSpeed = 0.0005 + (audioIntensity * audioIntensity) * 0.01;
      const cosR = Math.cos(rotationSpeed);
      const sinR = Math.sin(rotationSpeed);
      const nx = positions.array[i3] * cosR - positions.array[i3 + 2] * sinR;
      positions.array[i3 + 2] = positions.array[i3] * sinR + positions.array[i3 + 2] * cosR;
      positions.array[i3] = nx;
      
      // Keep particles within bounds (same as before)
      const newDistance = Math.sqrt(
        positions.array[i3] * positions.array[i3] + 
        positions.array[i3 + 1] * positions.array[i3 + 1] + 
        positions.array[i3 + 2] * positions.array[i3 + 2]
      );
      
      if (newDistance > 20) {
        // Reset to a smaller radius if particles drift too far
        const resetDirection = new THREE.Vector3(
          positions.array[i3], 
          positions.array[i3 + 1], 
          positions.array[i3 + 2]
        ).normalize();
        
        positions.array[i3] = resetDirection.x * 10;
        positions.array[i3 + 1] = resetDirection.y * 10;
        positions.array[i3 + 2] = resetDirection.z * 10;
      }
      
      // Adjust colors based on audio intensity - more subtle changes
      colors.array[i3] = 0.2 + audioIntensity * 0.7; // R
      colors.array[i3 + 1] = 0.1 + audioIntensity * 0.2; // G
      colors.array[i3 + 2] = 0.5 + audioIntensity * 0.3; // B
      
      // Adjust sizes with more subtle changes
      sizes.array[i] = (0.05 + Math.random() * 0.05) * (1 + audioIntensity * 1.5);
    }
    
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    sizes.needsUpdate = true;
  });
  
  return (
    <points ref={particlesRef}>
      {particles && <bufferGeometry {...particles} />}
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
};

// Energy disturbance component
const EnergyDisturbance = ({ audioData, sensitivity = 1.0 }: { audioData: number[], sensitivity?: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lastRotationRef = useRef({ x: 0, y: 0, z: 0 });
  
  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;
    
    // Calculate average audio intensity for overall scaling
    const avgIntensity = sensitivity * audioData.reduce((sum, val) => sum + val, 0) / audioData.length / 255;
    
    // Analyze frequency distribution to influence direction
    // Low frequencies (bass) - first few bands
    const lowFreqIntensity = sensitivity * audioData.slice(0, 2).reduce((sum, val) => sum + val, 0) / (2 * 255);
    // High frequencies (treble) - last few bands
    const highFreqIntensity = sensitivity * audioData.slice(5).reduce((sum, val) => sum + val, 0) / (3 * 255);
    // Mid frequencies
    const midFreqIntensity = sensitivity * audioData.slice(2, 5).reduce((sum, val) => sum + val, 0) / (3 * 255);
    
    // Create a subtle breathing effect when quiet
    const time = clock.elapsedTime;
    const breathingRate = 0.1; // Slow breathing
    const breathingEffect = (Math.sin(time * breathingRate) + 1) * 0.04; // 0.0-0.08 range
    
    // Smoother, more audio-reactive pulse effect 
    const pulseScale = 1 + breathingEffect + (avgIntensity * avgIntensity) * 0.8;
    
    // Scale based on audio with smoother transitions
    meshRef.current.scale.set(
      pulseScale,
      pulseScale,
      pulseScale
    );
    
    // Determine rotation direction based on frequency balance
    // Bass > Treble = one direction, Treble > Bass = other direction
    const xRotationDir = lowFreqIntensity > highFreqIntensity ? 1 : -1;
    const yRotationDir = midFreqIntensity > 0.3 ? 1 : -1;
    const zRotationDir = highFreqIntensity > lowFreqIntensity ? 1 : -1;
    
    // Apply subtle rotation when quiet, more active with sound
    // Using non-linear curve for more responsive movement with louder sounds
    const rotationBase = 0.001; // Very slow base rotation
    const rotationAudioFactor = Math.pow(avgIntensity, 2) * 0.05; // More responsive to loud sounds
    
    // Smooth the rotation by tracking previous values, with direction based on sound frequency
    lastRotationRef.current.x = lastRotationRef.current.x * 0.95 + (rotationBase + rotationAudioFactor) * 0.05 * xRotationDir;
    lastRotationRef.current.y = lastRotationRef.current.y * 0.95 + (rotationBase + rotationAudioFactor * 1.1) * 0.05 * yRotationDir;
    
    // Add z-axis rotation that changes direction based on high frequencies
    lastRotationRef.current.z = lastRotationRef.current.z * 0.95 + (rotationBase + highFreqIntensity * 0.02) * zRotationDir;
    
    meshRef.current.rotation.x += lastRotationRef.current.x;
    meshRef.current.rotation.y += lastRotationRef.current.y;
    meshRef.current.rotation.z += lastRotationRef.current.z;
    
    // Change material properties based on audio - smoother transitions
    const baseEmissive = 0.2 + breathingEffect; // Subtle base glow
    const emissiveIntensity = baseEmissive + avgIntensity * 2.5; // Less intense than before
    materialRef.current.emissiveIntensity = emissiveIntensity;
    
    // Create gentler color pulsing effect
    const r = 0.3 + 0.1 * Math.sin(time * 0.3) + avgIntensity * 0.5;
    const g = 0.1 + avgIntensity * 0.3;
    const b = 0.6 + 0.1 * Math.cos(time * 0.3) + avgIntensity * 0.4;
    
    materialRef.current.color.setRGB(r, g, b);
    materialRef.current.emissive.setRGB(r * 0.5, g * 0.5, b * 0.5);
    
    // Only change geometry with significant audio - less frequently
    if (meshRef.current.geometry instanceof THREE.TorusKnotGeometry) {
      // Force geometry update by creating a new one with parameters influenced by audio
      // Use frequency distribution to influence geometry
      // Bass boosts p parameter, treble boosts q parameter
      const p = Math.round(2 + lowFreqIntensity * 4);
      const q = Math.round(3 + highFreqIntensity * 4);
      
      // Only update geometry when significant change occurs and less frequently
      if (clock.elapsedTime % 2 < 0.1 && avgIntensity > 0.2) { // Higher threshold, less frequent
        meshRef.current.geometry.dispose();
        meshRef.current.geometry = new THREE.TorusKnotGeometry(
          1, // radius
          0.3 + avgIntensity * 0.15, // tube radius - less variation
          100, // tubular segments
          16, // radial segments
          p, // p
          q  // q
        );
      }
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1, 0.3, 100, 16, 2, 3]} />
      <meshStandardMaterial
        ref={materialRef}
        color="#4a00e0"
        metalness={0.7}
        roughness={0.2}
        emissive="#220066"
        emissiveIntensity={0.3} // Lower base intensity
        transparent
        opacity={0.8}
      />
    </mesh>
  );
};

// Main visualizer component
const SoundVisualizer = () => {
  const [audioProcessor] = useState(() => new AudioProcessor());
  const [isListening, setIsListening] = useState(false);
  const [audioData, setAudioData] = useState<number[]>(Array(8).fill(0));
  const [microphoneStatus, setMicrophoneStatus] = useState<'initial' | 'requesting' | 'active' | 'test' | 'sample' | 'error'>('initial');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [rawVolume, setRawVolume] = useState<number>(0);
  const [debugInfo, setDebugInfo] = useState<{raw: number[], avg: number}>({ raw: [], avg: 0 });
  const [sensitivity, setSensitivity] = useState<number>(1.0); // Default sensitivity is 1.0
  const animationFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  
  // Request microphone access and start listening
  const startListening = async () => {
    try {
      setMicrophoneStatus('requesting');
      const success = await audioProcessor.requestMicrophoneAccess();
      
      if (success) {
        setIsListening(true);
        setMicrophoneStatus('active');
      } else {
        setMicrophoneStatus('error');
        alert('Failed to access microphone. Please check permissions.');
      }
    } catch (error) {
      console.error('Error starting microphone:', error);
      setMicrophoneStatus('error');
      alert('An error occurred while accessing the microphone.');
    }
  };
  
  // Start test tone
  const startTestTone = async () => {
    try {
      setMicrophoneStatus('requesting');
      const success = await audioProcessor.createTestTone();
      
      if (success) {
        setIsListening(true);
        setMicrophoneStatus('test');
      } else {
        setMicrophoneStatus('error');
        alert('Failed to start test tone.');
      }
    } catch (error) {
      console.error('Error starting test tone:', error);
      setMicrophoneStatus('error');
      alert('An error occurred while creating test tone.');
    }
  };
  
  // Start sample music
  const startSampleMusic = async () => {
    try {
      setMicrophoneStatus('requesting');
      
      // Create audio element if it doesn't exist
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio("https://s3-us-west-2.amazonaws.com/s.cdpn.io/858/outfoxing.mp3");
        audioElementRef.current.crossOrigin = "anonymous";
        audioElementRef.current.loop = true;
        // Preload the audio
        audioElementRef.current.load();
      }
      
      // Connect audio element to analyzer
      const success = await audioProcessor.connectAudioElement(audioElementRef.current);
      
      if (success) {
        try {
          // Play the audio - the processor may have created a new element
          await audioElementRef.current.play();
          console.log("Sample music started playing");
          setIsListening(true);
          setMicrophoneStatus('sample');
        } catch (playError) {
          console.error("Error playing audio:", playError);
          setMicrophoneStatus('error');
          alert('Failed to play audio. This might be due to browser autoplay restrictions. Try clicking on the page first.');
        }
      } else {
        setMicrophoneStatus('error');
        alert('Failed to connect sample audio.');
      }
    } catch (error) {
      console.error('Error starting sample music:', error);
      setMicrophoneStatus('error');
      alert('An error occurred while starting sample music.');
    }
  };
  
  // Stop listening - update to handle sample audio
  const stopListening = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop audio if playing
    if (audioElementRef.current && microphoneStatus === 'sample') {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      } catch (e) {
        console.error("Error stopping audio:", e);
      }
    }
    
    audioProcessor.cleanup();
    setIsListening(false);
    setMicrophoneStatus('initial');
    setAudioData(Array(8).fill(0)); // Reset audio data
    setAudioLevel(0); // Reset audio level
  };
  
  // Update audio data in animation frame
  const updateAudioData = () => {
    if (isListening) {
      // Get raw frequency data for debugging
      const rawData = audioProcessor.getFrequencyData();
      
      // Get raw volume level (RMS)
      const currentRawVolume = audioProcessor.getRawVolume();
      setRawVolume(currentRawVolume);
      // console.log("Raw volume:", currentRawVolume);
      
      // Get processed frequency bands for visualization
      const frequencyBands = audioProcessor.getFrequencyBands();
      
      // Calculate raw audio metrics for debugging
      let rawAvg = 0;
      let rawMax = 0;
      let nonZeroCount = 0;
      
      if (rawData) {
        // Sample a portion of the frequency data (first 100 bins)
        const sampleData = Array.from(rawData.slice(0, 100));
        rawMax = Math.max(...sampleData);
        
        // Count non-zero values
        nonZeroCount = sampleData.filter(v => v > 0).length;
        
        // Calculate average of non-zero values
        const nonZeroSum = sampleData.reduce((sum, val) => val > 0 ? sum + val : sum, 0);
        rawAvg = nonZeroCount > 0 ? nonZeroSum / nonZeroCount : 0;
        
        // Update debug info state
        setDebugInfo({
          raw: sampleData.slice(0, 20), // Show first 20 values
          avg: rawAvg
        });
        
        // console.log(`Raw audio stats - Max: ${rawMax}, NonZero: ${nonZeroCount}/100, Avg: ${rawAvg.toFixed(2)}, RMS Volume: ${currentRawVolume.toFixed(4)}`);
      }
      
      // Log the processed frequency data
      // console.log('Audio bands in component:', frequencyBands);
      
      // Calculate a more reliable audio level
      // First check if we have any non-zero values
      const hasSignal = frequencyBands.some(val => val > 1); // Use a small threshold
      
      if (hasSignal) {
        // Calculate maximum value for more responsive visual indicator
        const maxLevel = Math.max(...frequencyBands) / 255;
        
        // Apply cubic scaling to make small sounds more visible but preserve dynamic range
        const scaledLevel = Math.min(1, Math.pow(maxLevel, 1/2)); // Less aggressive scaling
        
        // console.log('Max level:', maxLevel.toFixed(4), 'Scaled level:', scaledLevel.toFixed(4));
        setAudioLevel(scaledLevel);
        
        // Always update audio data when we have a signal
        setAudioData([...frequencyBands]); // Create a new array to ensure state update
      } else {
        console.log('No audio signal detected', nonZeroCount > 0 ? `(but raw data shows ${nonZeroCount} non-zero values)` : '');
        
        // For real microphone or sample music with no signal, still update with zeros to keep animation responsive
        setAudioData(Array(8).fill(0)); 
      }
      
      // Use a shorter timeout interval for more responsive UI
      animationFrameRef.current = setTimeout(updateAudioData, 100);
    }
  };
  
  // Use useEffect to trigger updateAudioData when isListening changes
  useEffect(() => {
    if (isListening) {
      updateAudioData();
    }
  }, [isListening]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      audioProcessor.cleanup();
    };
  }, []);
  
  return (
    <div className="w-full h-full">
      <div className="absolute top-4 left-4 z-10">
        <div className="backdrop-blur-md bg-blue-800/30 border border-white/20 p-4 rounded-xl shadow-xl max-w-xs">
          <h3 className="text-white font-medium mb-3 text-lg">Sound Visualizer</h3>
          
          {!isListening ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={startListening}
                disabled={microphoneStatus === 'requesting'}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg hover:from-indigo-600 hover:to-blue-700 transition-all disabled:opacity-50 font-medium shadow-md flex items-center justify-center"
              >
                {microphoneStatus === 'requesting' ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Requesting Access
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Start Microphone
                  </span>
                )}
              </button>
              
              <button
                onClick={startSampleMusic}
                disabled={microphoneStatus === 'requesting'}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 font-medium shadow-md flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Use Sample Music
              </button>
              
              <button
                onClick={startTestTone}
                disabled={microphoneStatus === 'requesting'}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 font-medium shadow-md flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Use Synthetic
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={stopListening}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-lg hover:from-rose-600 hover:to-red-600 transition-all font-medium shadow-md flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                {microphoneStatus === 'test' ? 'Stop Test Sound' : 
                 microphoneStatus === 'sample' ? 'Stop Sample Music' : 'Stop Listening'}
              </button>
              
              {/* Audio level indicator with enhanced UI */}
              <div className="mt-1">
                <div className="text-white text-sm mb-1.5 flex justify-between items-center">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                    </svg>
                    Audio Level
                  </span>
                  <span className="font-medium text-blue-300">{Math.round(audioLevel * 100)}%</span>
                </div>
                <div className="h-2.5 w-full bg-gray-800/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-75"
                    style={{ width: `${Math.max(2, audioLevel * 100)}%` }}
                  />
                </div>
              </div>
              
              {/* Raw volume meter */}
              <div className="mt-1">
                <div className="text-white text-sm mb-1.5 flex justify-between items-center">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-green-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                    </svg>
                    Raw Volume
                  </span>
                  <span className="font-medium text-green-300">{(rawVolume * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2.5 w-full bg-gray-800/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.max(2, rawVolume * 100)}%` }}
                  />
                </div>
              </div>
              
              {/* Sensitivity slider */}
              <div className="mt-3">
                <div className="text-white text-sm mb-1.5 flex justify-between items-center">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    Sensitivity
                  </span>
                  <span className="font-medium text-yellow-300">{(sensitivity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-800/50 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                />
              </div>
              
              {/* Collapsible Debug Panel */}
              <div className="mt-3 border-t border-white/10 pt-3">
                <details className="text-white">
                  <summary className="cursor-pointer text-sm font-medium flex items-center text-gray-300 hover:text-white">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Debug Information
                  </summary>
                  <div className="mt-2 bg-gray-900/50 rounded-lg p-2 text-xs">
                    <div className="grid grid-cols-2 gap-1">
                      <div>Raw Avg: <span className="font-mono">{debugInfo.avg.toFixed(2)}</span></div>
                      <div>RMS Vol: <span className="font-mono">{(rawVolume).toFixed(4)}</span></div>
                      <div>Status: <span className="font-mono">{microphoneStatus}</span></div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono truncate">
                      Raw: [{debugInfo.raw.map(v => v.toString().padStart(3, ' ')).join(', ')}]
                    </div>
                    <div className="h-16 w-full mt-2 relative bg-gray-900/70 rounded-md border border-gray-800">
                      {debugInfo.raw.map((val, i) => (
                        <div 
                          key={i}
                          className="absolute bottom-0 bg-emerald-500/80"
                          style={{
                            left: `${(i / debugInfo.raw.length) * 100}%`,
                            height: `${(val / 255) * 100}%`,
                            width: `${100 / debugInfo.raw.length}%`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <Canvas className="w-full h-full">
        <PerspectiveCamera makeDefault position={[0, 0, 15]} />
        <OrbitControls enableZoom={false} />
        
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        <CloudParticles audioData={audioData} sensitivity={sensitivity} />
        <EnergyDisturbance audioData={audioData} sensitivity={sensitivity} />
      </Canvas>
    </div>
  );
};

export default SoundVisualizer; 