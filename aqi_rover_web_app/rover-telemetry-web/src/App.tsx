import { useState, useEffect, useRef } from 'react';
import './App.css';
import React from 'react';

// 1. EXPANDED TYPES TO MATCH THE 6-TIER OFFICIAL AQI SCALE
interface RoverTelemetry {
  device_id: string;
  timestamp: number;
  air_quality_ppm: number;
  sensor_voltage: number;
  status: 'GOOD' | 'MODERATE' | 'UNHEALTHY_SG' | 'UNHEALTHY' | 'VERY_UNHEALTHY' | 'HAZARDOUS';
  x?: number;
  y?: number;
}

// 2. CENTRALIZED AQI CONFIGURATION UTILITY (Matches image_33f27a.jpg thresholds)
export const getAQIDetails = (ppm: number) => {
  if (ppm <= 50) {
    return { label: 'GOOD', color: '#10B981', textColor: '#FFFFFF' }; // Green
  }
  if (ppm <= 100) {
    return { label: 'MODERATE', color: '#FBBF24', textColor: '#0F172A' }; // Yellow
  }
  if (ppm <= 150) {
    return { label: 'UNHEALTHY (SG)', color: '#F97316', textColor: '#FFFFFF' }; // Orange
  }
  if (ppm <= 200) {
    return { label: 'UNHEALTHY', color: '#EF4444', textColor: '#FFFFFF' }; // Red
  }
  if (ppm <= 300) {
    return { label: 'VERY UNHEALTHY', color: '#A855F7', textColor: '#FFFFFF' }; // Purple
  }
  return { label: 'HAZARDOUS', color: '#7F1D1D', textColor: '#FFFFFF' }; // Maroon
};

interface HeatmapProps {
  streamHistory: RoverTelemetry[];
}

const GriddedHeatmap: React.FC<HeatmapProps> = ({ streamHistory }) => {
  const gridSize = 12;
  const matrix: number[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(-1));

  streamHistory.forEach((frame) => {
    const cx = Math.min(gridSize - 1, Math.max(0, frame.x ?? 0));
    const cy = Math.min(gridSize - 1, Math.max(0, frame.y ?? 0));
    matrix[cy][cx] = frame.air_quality_ppm;
  });

  return (
    <section className="chart-analytics-container" style={{ marginTop: '24px' }}>
      <h2> Real-Time Spatial Gas Distribution Mapping</h2>
      <div style={{ backgroundColor: '#1E293B', padding: '20px', borderRadius: '8px', marginTop: '12px' }}>
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`, 
            gap: '4px',
            backgroundColor: '#0F172A',
            padding: '12px',
            borderRadius: '6px'
          }}
        >
          {Array.from({ length: gridSize }).map((_, rIndex) => {
            const y = gridSize - 1 - rIndex;
            return Array.from({ length: gridSize }).map((_, x) => {
              const aqiValue = matrix[y][x];
              const aqi = aqiValue !== -1 ? getAQIDetails(aqiValue) : null;
              
              return (
                <div
                  key={`${x}-${y}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: aqi ? aqi.color : '#1E293B',
                    borderRadius: '4px',
                    transition: 'background-color 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  title={`Coords: (${x}, ${y}) | AQI: ${aqiValue !== -1 ? `${aqiValue} PPM (${aqi?.label})` : 'No Data'}`}
                >
                  {aqiValue !== -1 && (
                    <span style={{ fontSize: '9px', color: aqi?.textColor, fontWeight: 'bold' }}>
                      {aqiValue}
                    </span>
                  )}
                </div>
              );
            });
          })}
        </div>
        
        {/* Synchronized Continuous Legend Footer Component */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', fontWeight: '600' }}>
          <span style={{ color: '#10B981' }}> Good (0-50)</span>
          <span style={{ color: '#FBBF24' }}> Moderate (51-100)</span>
          <span style={{ color: '#F97316' }}> Unhealthy SG (101-150)</span>
          <span style={{ color: '#EF4444' }}> Unhealthy (151-200)</span>
          <span style={{ color: '#A855F7' }}> Very Unhealthy (201-300)</span>
          <span style={{ color: '#7F1D1D' }}> Hazardous (301+)</span>
          <span style={{ color: '#64748B' }}> Unvisited</span>
        </div>
      </div>
    </section>
  );
};

export default function App() {
  const [telemetryStream, setTelemetryStream] = useState<RoverTelemetry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isUsingSimulator, setIsUsingSimulator] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const AWS_WS_URL = "wss://0oac11f8x8.execute-api.eu-north-1.amazonaws.com/production/";
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (isUsingSimulator) {
      setIsConnected(true);
      setError(null);
      
      let simX = 0;
      let simY = 0;

      const interval = setInterval(() => {
        simX = (simX + (Math.random() > 0.5 ? 1 : 0)) % 12;
        simY = (simY + (Math.random() > 0.5 ? 1 : 0)) % 12;

        const generatedPpm = Math.floor(Math.random() * (450 - 20 + 1)) + 20;
        
        // Sim maps programmatically using our new centralized classification bounds
        let calculatedStatus: RoverTelemetry['status'] = 'GOOD';
        if (generatedPpm <= 50) calculatedStatus = 'GOOD';
        else if (generatedPpm <= 100) calculatedStatus = 'MODERATE';
        else if (generatedPpm <= 150) calculatedStatus = 'UNHEALTHY_SG';
        else if (generatedPpm <= 200) calculatedStatus = 'UNHEALTHY';
        else if (generatedPpm <= 300) calculatedStatus = 'VERY_UNHEALTHY';
        else calculatedStatus = 'HAZARDOUS';

        const mockPacket: RoverTelemetry = {
          device_id: "ROVER-01-SIM",
          timestamp: Math.floor(Date.now() / 1000),
          air_quality_ppm: generatedPpm,
          sensor_voltage: parseFloat((Math.random() * (5.2 - 4.6) + 4.6).toFixed(2)),
          status: calculatedStatus,
          x: simX,
          y: simY
        };

        setTelemetryStream((prev) => [...prev, mockPacket]);
      }, 3000);

      return () => clearInterval(interval);
    } else {
      connectWebSocket();
    }

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [isUsingSimulator]);

  const connectWebSocket = () => {
    try {
      if (AWS_WS_URL.includes("YOUR_API_ID")) {
        setError("Please replace the placeholder URL with your real AWS wss:// production endpoint.");
        return;
      }

      ws.current = new WebSocket(AWS_WS_URL);
      ws.current.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

     ws.current.onmessage = (event) => {
        console.log(" SYSTEM DIAGNOSTIC - Raw Data Received from AWS:", event.data);
        try {
          const parsedData = JSON.parse(event.data);
          const incomingPacket: RoverTelemetry = parsedData.data ? parsedData.data : parsedData;

          if (incomingPacket && incomingPacket.device_id) {
            incomingPacket.x = incomingPacket.x !== undefined ? incomingPacket.x : 0;
            incomingPacket.y = incomingPacket.y !== undefined ? incomingPacket.y : 0;
            setTelemetryStream((prev) => [...prev, incomingPacket]);
          }
        } catch (err) {
          console.error(" Failed to parse data stream string:", err);
        }
      };

      ws.current.onerror = () => {
        setError("Cloud router handshake timeout. Check API Gateway deployment state.");
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        if (!isUsingSimulator) {
          setTimeout(connectWebSocket, 5000);
        }
      };
    } catch (e) {
      setError(`Socket Exception: ${e}`);
    }
  };

  const latestData = telemetryStream[telemetryStream.length - 1];
  const totalSamples = telemetryStream.length;
  const chartDataWindow = telemetryStream.slice(-15);

  const svgW = 900;
  const svgH = 300;
  const padL = 60;
  const padR = 60;
  const padT = 30;
  const padB = 40;
  const graphW = svgW - padL - padR;
  const graphH = svgH - padT - padB;

  const ppmMin = 0;
  const ppmMax = 500;
  const voltMin = 0.0;
  const voltMax = 5.5;

  let ppmPointsString = "";
  let voltPointsString = "";

  if (chartDataWindow.length > 1) {
    chartDataWindow.forEach((packet, index) => {
      const x = padL + (index / (chartDataWindow.length - 1)) * graphW;
      const ppmY = padT + graphH - ((packet.air_quality_ppm - ppmMin) / (ppmMax - ppmMin)) * graphH;
      const voltY = padT + graphH - ((packet.sensor_voltage - voltMin) / (voltMax - voltMin)) * graphH;

      ppmPointsString += `${index === 0 ? 'M' : 'L'} ${x} ${ppmY} `;
      voltPointsString += `${index === 0 ? 'M' : 'L'} ${x} ${voltY} `;
    });
  }

  return (
    <div className="dashboard-app">
      <header className="dashboard-header">
        <div className="brand">
          <span className="logo-icon"></span>
          <div>
            <h1>AQI Rover Mission Control</h1>
            <p className="subtitle">Enterprise IoT Telemetry Architecture • Bachelor Thesis Project</p>
          </div>
        </div>
        <div className="controls">
          <button 
            className={`mode-toggle ${isUsingSimulator ? 'demo-mode' : 'cloud-mode'}`}
            onClick={() => {
              setIsUsingSimulator(!isUsingSimulator);
              setTelemetryStream([]); 
            }}
          >
            {isUsingSimulator ? " Running: Local Simulator" : " Target: Live AWS Cloud"}
          </button>
          <div className={`status-indicator ${isConnected ? 'online' : 'offline'}`}>
            <span className="pulse-dot"></span>
            {isConnected ? "Telemetry Active" : "Pipeline Disconnected"}
          </div>
        </div>
      </header>

      {error && <div className="error-alert">⚠️ {error}</div>}

      <main className="dashboard-view">
        <section className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">Current Gas Concentration</span>
            <div className="kpi-value">
              {latestData ? `${latestData.air_quality_ppm}` : "---"} 
              <span className="unit">PPM</span>
            </div>
            <div className="kpi-footer">Sensor: MQ-135 Air Quality</div>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Bus Voltage Layer</span>
            <div className="kpi-value voltage">
              {latestData ? `${latestData.sensor_voltage}` : "---"}
              <span className="unit">V</span>
            </div>
            <div className="kpi-footer">Power Domain: 5V Regulated</div>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Total Pipeline Stream Cache</span>
            <div className="kpi-value samples">
              {totalSamples}
              <span className="unit">Packets</span>
            </div>
            <div className="kpi-footer">Stateful memory log</div>
          </div>
        </section>

        <section className="chart-analytics-container">
          <h2>Real-Time Dynamic Oscilloscope Feed (Dual Axis Scalar Path)</h2>
          <div className="chart-wrapper">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="telemetry-svg">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = padT + ratio * graphH;
                const ppmVal = ppmMax - ratio * (ppmMax - ppmMin);
                const voltVal = voltMax - ratio * (voltMax - voltMin);
                return (
                  <g key={i}>
                    <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#222f43" strokeDasharray="4 4" />
                    <text x={padL - 12} y={y + 4} textAnchor="end" fill="#38bdf8" className="axis-text">{Math.round(ppmVal)}</text>
                    <text x={svgW - padR + 12} y={y + 4} textAnchor="start" fill="#fb923c" className="axis-text">{voltVal.toFixed(2)}V</text>
                  </g>
                );
              })}

              {chartDataWindow.length > 1 && chartDataWindow.map((packet, idx) => {
                if (idx % 3 === 0) {
                  const divisor = chartDataWindow.length - 1;
                  const x = padL + (idx / (divisor > 0 ? divisor : 1)) * graphW;
                  const timeStr = new Date(packet.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <text key={idx} x={x} y={svgH - 12} textAnchor="middle" fill="#64748b" className="axis-text timestamp-text">
                      {timeStr}
                    </text>
                  );
                }
                return null;
              })}

              {chartDataWindow.length > 1 ? (
                <>
                  <path d={ppmPointsString} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={voltPointsString} fill="none" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {chartDataWindow.map((packet, index) => {
                    const x = padL + (index / (chartDataWindow.length - 1)) * graphW;
                    const ppmY = padT + graphH - ((packet.air_quality_ppm - ppmMin) / (ppmMax - ppmMin)) * graphH;
                    return <circle key={index} cx={x} cy={ppmY} r="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />;
                  })}
                </>
              ) : (
                <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill="#64748b" className="axis-text">
                  Awaiting inbound active telemetry frames...
                </text>
              )}
            </svg>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-color blue"></span> Gas Quality (PPM)</span>
              <span className="legend-item"><span className="legend-color orange"></span> Bus Power Grid (Volts)</span>
            </div>
          </div>
        </section>

        {/* HEATMAP MOUNT POINT */}
        <GriddedHeatmap streamHistory={telemetryStream} />

        <section className="ledger-container">
          <h2>Real-Time Chronological Telemetry Stream Log</h2>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Local System Clock</th>
                  <th>Hardware Token</th>
                  <th>Gas Metrics</th>
                  <th>Voltage Check</th>
                  <th>Node Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {telemetryStream.slice().reverse().map((packet, idx) => {
                  // 3. DYNAMIC TABLE CORRECTION USING INLINE PASS-THROUGH STYLES
                  const aqiUi = getAQIDetails(packet.air_quality_ppm);
                  
                  return (
                    <tr key={packet.timestamp + idx} className="fade-in-row">
                      <td>{new Date(packet.timestamp * 1000).toLocaleTimeString()}</td>
                      <td className="mono-text">{packet.device_id}</td>
                      <td className="bold-text" style={{ color: aqiUi.color }}>{packet.air_quality_ppm} PPM</td>
                      <td>{packet.sensor_voltage} V</td>
                      <td>
                        <span 
                          className="status-tag"
                          style={{ 
                            backgroundColor: aqiUi.color, 
                            color: aqiUi.textColor,
                            fontWeight: 'bold',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}
                        >
                          {aqiUi.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {totalSamples === 0 && (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      No packet data in current viewport.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}