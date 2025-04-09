# Sound Visualization App

A React web application that displays dynamic, futuristic visualizations based on sound input from your microphone in real-time.

## Features

- Real-time audio processing from microphone input
- Futuristic cloud-like particle visualization that responds to sound
- Energy disturbance visualization that pulses with audio intensity
- Interactive 3D scene with orbit controls

## Technologies Used

- React
- TypeScript
- Three.js
- React Three Fiber
- Web Audio API
- Tailwind CSS

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- pnpm

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```

### Running the App

Start the development server:

```
pnpm dev
```

Then open your browser to the URL shown in the terminal (typically http://localhost:5173).

### Usage

1. Click the "Start Listening" button to grant microphone access
2. Speak, sing, or play music to see the visualization respond to sound
3. Use your mouse to orbit around the visualization:
   - Left-click and drag to rotate
   - Right-click and drag to pan
4. Click "Stop Listening" when you're done

## How It Works

The app uses the Web Audio API to analyze sound from your microphone in real-time. It divides the audio into frequency bands and uses this data to animate:

1. A cloud of particles that move and change color based on audio intensity
2. A central energy disturbance that pulses and rotates with the sound

## License

MIT
