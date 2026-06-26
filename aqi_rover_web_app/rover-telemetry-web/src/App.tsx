import { useState, useEffect, useRef } from 'react';
import './App.css';
import React from 'react';

// ─── AWS AMPLIFY AUTH IMPORTS ───────────────────────────────────────
import { signIn, signUp, confirmSignUp, signOut, getCurrentUser, signInWithRedirect, resetPassword, confirmResetPassword} from 'aws-amplify/auth';

// 1. EXPANDED TYPES TO MATCH THE 6-TIER OFFICIAL AQI SCALE
interface RoverTelemetry {
  device_id: string;
  timestamp: number;
  air_quality_ppm: number;
  sensor_voltage: number;
  status: 'GOOD' | 'MODERATE' | 'UNHEALTHY_SG' | 'UNHEALTHY' | 'VERY_UNHEALTHY' | 'HAZARDOUS';
  x?: number;
  y?: number;
}''


interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  stream: RoverTelemetry[];
}



// 2. CENTRALIZED AQI CONFIGURATION UTILITY 
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


// ─── MATHEMATICAL ADJACENCY AUDIT ENGINE ────────────────────────────
const analyzeSpatialUncertainty = (stream: RoverTelemetry[], threshold = 35) => {
  const gridSize = 12;
  const matrix: number[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(-1));

  stream.forEach((frame) => {
    const cx = Math.min(gridSize - 1, Math.max(0, frame.x ?? 0));
    const cy = Math.min(gridSize - 1, Math.max(0, frame.y ?? 0));
    matrix[cy][cx] = frame.air_quality_ppm;
  });

  const anomalies: Array<{ cell1: string; cell2: string; val1: number; val2: number; delta: number }> = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const currentVal = matrix[y][x];
      if (currentVal === -1) continue;

      // Scan Right Neighbor
      if (x + 1 < gridSize) {
        const rightVal = matrix[y][x + 1];
        if (rightVal !== -1) {
          const delta = Math.abs(currentVal - rightVal);
          if (delta >= threshold) {
            anomalies.push({ cell1: `(${x}, ${y})`, cell2: `(${x + 1}, ${y})`, val1: currentVal, val2: rightVal, delta });
          }
        }
      }

      // Scan Top Neighbor
      if (y + 1 < gridSize) {
        const topVal = matrix[y + 1][x];
        if (topVal !== -1) {
          const delta = Math.abs(currentVal - topVal);
          if (delta >= threshold) {
            anomalies.push({ cell1: `(${x}, ${y})`, cell2: `(${x}, ${y + 1})`, val1: currentVal, val2: topVal, delta });
          }
        }
      }
    }
  }
  return anomalies;
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

  const realTimeAnomalies = analyzeSpatialUncertainty(streamHistory, 35);

  return (
    <section className="chart-analytics-container" style={{ marginTop: '24px' }}>
      <h2>Real-Time Spatial Gas Distribution Mapping</h2>
      <div style={{ backgroundColor: '#1E293B', padding: '20px', borderRadius: '8px', marginTop: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: '4px', backgroundColor: '#0F172A', padding: '12px', borderRadius: '6px' }}>
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
        
        {/* Real-time Anomaly Banner */}
        {realTimeAnomalies.length > 0 && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#451A03', border: '1px solid #9A3412', borderRadius: '6px', fontSize: '13px', color: '#FED7AA' }}>
            <strong> Zones with Major Uncertainty Detected (Δ bigger than 35 AQI):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {realTimeAnomalies.slice(0, 5).map((anom, i) => (
                <span key={i} style={{ background: '#7C2D12', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                  {anom.cell1} ↔ {anom.cell2} (Δ : {anom.delta} PPM)
                </span>
              ))}
              {realTimeAnomalies.length > 5 && <span>+ {realTimeAnomalies.length - 5} more boundaries</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default function App() {
  // ─── EXISTING STATE PROPS ──────────────────────────────────────────
  const [telemetryStream, setTelemetryStream] = useState<RoverTelemetry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isUsingSimulator, setIsUsingSimulator] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Session Preservation State Matrix
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [sessionNameInput, setSessionNameInput] = useState<string>('');
  const [selectedSessionA, setSelectedSessionA] = useState<string>('');
  const [selectedSessionB, setSelectedSessionB] = useState<string>('');

  // ─── NEW COGNITO AUTHENTICATION SYSTEM STATE ────────────────────────
  const [authUser, setAuthUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [authView, setAuthView] = useState<'login' | 'signup' | 'confirm' | 'forgot' | 'confirm_forgot'>('login');
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  
  // Authentication Credential Inputs
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  
  const AWS_WS_URL = "wss://0oac11f8x8.execute-api.eu-north-1.amazonaws.com/production/";
  const ws = useRef<WebSocket | null>(null);

  // ─── AUTH SYNC EFFECT: VERIFY REFRESH SESSION VALIDITY ───────────────
  useEffect(() => {
    checkUserSession();
  }, []);

  async function checkUserSession() {
    try {
      const activeSessionUser = await getCurrentUser();
      setAuthUser(activeSessionUser);
    } catch (err) {
      setAuthUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  // ─── AUTH EVENT ROUTERS ──────────────────────────────────────────
 async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    
    // ─── ADD THIS DIAGNOSTIC LOG HERE ───
    // Temporarily update this inside your handleLogin function to audit your state:
    console.log("GATEWAY SUBMISSION LOG:", { 
      emailSent: email,
      emailLength: email.length,
      passwordLength: password ? password.length : 0
    });

    try {
      
      const { isSignedIn } = await signIn({ 
        username: email.trim(), 
        password: password 
      });

      if (isSignedIn) {
        const user = await getCurrentUser();
        setAuthUser(user);
        // Turn off guest mode if it was active
        setIsGuest(false); 
      }
    } catch (err: any) {
      console.error("System access rejection logs:", err);
      // Fallback message if Cognito returns a raw error
      setAuthError(err.message || 'Incorrect username or password.'); 
    }
  }
  

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } }
      });
      setAuthView('confirm');
    } catch (err: any) {
      setAuthError(err.message || 'Registration fault registration properties.');
    }
  }

  async function handleConfirmSignUp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      await confirmSignUp({ username: email, confirmationCode });
      alert('Cognito Account Verified Successfully! Proceeding to gate check.');
      setAuthView('login');
    } catch (err: any) {
      setAuthError(err.message || 'Verification token rejected.');
    }
  }


  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      await resetPassword({ username: email });
      setAuthView('confirm_forgot');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to initiate password reset sequence.');
    }
  }

  async function handleConfirmForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      await confirmResetPassword({ 
        username: email, 
        confirmationCode, 
        newPassword 
      });
      alert('Password updated successfully! Redirecting to login gate.');
      setNewPassword('');
      setConfirmationCode('');
      setAuthView('login');
    } catch (err: any) {
      setAuthError(err.message || 'Password update token rejected.');
    }
  }

  async function handleLogout() {
    try {
      await signOut();
    } catch (err) {
      console.error('Cognito active token destruction error:', err);
    }
    setAuthUser(null);
    setIsGuest(false);
    setAuthView('login');
  }


  // ─── ADD THIS GOOGLE ROUTER ACTION ─────────────────────────────────
  async function handleGoogleSignIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.preventDefault(); // Extra layer of security against form submission loops
  console.log("Google Sign-In button triggered. Initiating handshake...");

  try {
    // This shifts the browser window context over to AWS secure domains
    await signInWithRedirect({ provider: 'Google', options: {prompt: 'SELECT_ACCOUNT'} });
  } catch (err: any) {
    // If Amplify fails to find its config keys, it throws an error here instead of redirecting
    console.error("Amplify OAuth redirection failed locally:", err);
  }
}

  async function handleGoogleLogin() {
  try {
    await signInWithRedirect({ provider: 'Google' });
  } catch (err) {
    console.error("Google OAuth handshake failed:", err);
  }
}
  

// ─── TELEMETRY LOOP CONTROLS (VERTICAL Y-AXIS SNAKE TRAVERSAL) ───────
  useEffect(() => {
    if (!authUser && !isGuest) return;

    if (isUsingSimulator) {
      setIsConnected(true);
      setError(null);
      
      let simX = 0;
      let simY = 0;
      const GRID_MAX = 12;

      const interval = setInterval(() => {
        let generatedPpm = Math.floor(Math.random() * 15) + 20;
        
        // Target Hotspot at coordinates (5,5) to (6,6)
        if ((simY === 5 || simY === 6) && (simX === 5 || simX === 6)) {
          generatedPpm += 65; 
        }

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

        // ─── VERTICAL SNAKE LOGIC (SWEEP Y AXIS FIRST) ───
        if (simX % 2 === 0) {
          // Even Columns (0, 2, 4...): Climb UP the grid
          if (simY < GRID_MAX - 1) {
            simY++;
          } else {
            simX++; // Hit top boundary, advance right to next column
          }
        } else {
          // Odd Columns (1, 3, 5...): Descend DOWN the grid
          if (simY > 0) {
            simY--;
          } else {
            simX++; // Hit bottom boundary, advance right to next column
          }
        }

        // Reset system to origin if the entire 12x12 matrix boundary is crossed
        if (simX >= GRID_MAX) {
          simX = 0;
          simY = 0;
        }
      }, 1000); // Speeds step times slightly to 1s for smoother visual tracking

      return () => clearInterval(interval);
    } else {
      connectWebSocket();
    }

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [isUsingSimulator, authUser, isGuest]);

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

  // ─── RENDER MATH PATH CALCULATIONS (YOUR ORIGINAL LOGIC) ────────────
  const saveCurrentSessionSnapshot = () => {
    if (telemetryStream.length === 0) {
      alert("Cannot commit an empty cache string to the local vault.");
      return;
    }
    const name = sessionNameInput.trim() || `Sweep Session #${savedSessions.length + 1}`;
    const newSession: SavedSession = {
      id: `sess_${Date.now()}`,
      name: name,
      timestamp: Date.now(),
      stream: [...telemetryStream]
    };
    setSavedSessions([...savedSessions, newSession]);
    setSessionNameInput('');
    alert(`Session matrix saved successfully as: "${name}"`);
  };

  const sessionAData = savedSessions.find(s => s.id === selectedSessionA);
  const sessionBData = savedSessions.find(s => s.id === selectedSessionB);

  const anomaliesA = sessionAData ? analyzeSpatialUncertainty(sessionAData.stream, 35) : [];
  const anomaliesB = sessionBData ? analyzeSpatialUncertainty(sessionBData.stream, 35) : [];

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

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 'bold', color: '#94A3B8' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', background: '#0F172A', border: '1px solid #334155', borderRadius: '6px', color: '#FFF', marginBottom: '16px', boxSizing: 'border-box' };
  const btnStyle: React.CSSProperties = { width: '100%', padding: '12px', background: '#38BDF8', border: 'none', borderRadius: '6px', color: '#0F172A', fontWeight: 'bold', cursor: 'pointer', marginBottom: '10px' };


  // 1. Loading Guard State
  if (authLoading) {
    return (
      <div style={{ background: '#0F172A', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#64748B' }}>
        <h3>Validating Cloud Handshake tokens...</h3>
      </div>
    );
  }

  // 2. Gatekeeper Screen View Route (User is completely unauthenticated)
  if (!authUser && !isGuest) {
    return (
      <div style={{ background: '#0F172A', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', padding: '20px' }}>
        <div style={{ background: '#1E293B', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', width: '100%', maxWidth: '380px', color: '#E2E8F0', border: '1px solid #334155' }}>
          
          {/* VIEW A: LOGIN INTERFACE */}
          {authView === 'login' && (
            <form onSubmit={handleLogin}>
              <h2 style={{ textAlign: 'center', marginBottom: '8px', color: '#F8FAFC' }}>Mission Control Gateway</h2>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748B', marginTop: '0', marginBottom: '24px' }}>Sign in to save your driving analysis profiles</p>
              
              {authError && <div style={{ color: '#EF4444', background: '#451A03', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px', border: '1px solid #78350F' }}> {authError}</div>}
              
              <label style={labelStyle}>Academic Email Vector</label>
              <input type="email" placeholder="name@university.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              
              <label style={labelStyle}>Secure Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <div style={{ textAlign: 'right', marginTop: '-12px', marginBottom: '20px' }}>
                <span 
                  onClick={() => { setAuthError(''); setAuthView('forgot'); }} 
                  style={{ color: '#38BDF8', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                >
                  Forgot Password?
                </span>
              </div>

              <button type="submit" style={btnStyle}>Authenticate Token</button>
              
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
                <hr style={{ flex: 1, borderColor: '#334155' }} />
                <span style={{ padding: '0 10px', fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>OR</span>
                <hr style={{ flex: 1, borderColor: '#334155' }} />
              </div>
              
              {/* ─── NEW: INTEGRATED IDENTITY PROVIDER LINK ────────────────── */}
              <button 
                type="button" 
                onClick={handleGoogleSignIn} 
                style={{ ...btnStyle, backgroundColor: '#1E293B', color: '#F1F5F9', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' }}
              >
                <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.99 5.99 0 0 1 8 12.527a5.99 5.99 0 0 1 5.991-5.99c2.472 0 4.542 1.538 5.372 3.693l3.965-3.076C21.1 3.522 17.84 1.333 13.99 1.333 7.82 1.333 2.82 6.333 2.82 12.527c0 6.193 5 11.193 11.17 11.193 6.44 0 11.233-4.526 11.233-11.437 0-.712-.083-1.402-.23-2.001H12.24Z"/>
                </svg>
                Sign in with Google
              </button>
              

              <button type="button" onClick={() => setIsGuest(true)} style={{ ...btnStyle, backgroundColor: '#334155', color: '#F1F5F9' }}>
                Continue as Guest (Read-Only)
              </button>
              
              <p style={{ textAlign: 'center', fontSize: '13px', marginTop: '20px', color: '#94A3B8' }}>
                New research node? <span onClick={() => setAuthView('signup')} style={{ color: '#38BDF8', cursor: 'pointer', fontWeight: '600' }}>Register Account</span>
              </p>
            </form>
          )}

          {/* VIEW B: SIGN UP INTERFACE */}
          {authView === 'signup' && (
            <form onSubmit={handleSignUp}>
              <h2 style={{ textAlign: 'center', marginBottom: '8px', color: '#F8FAFC' }}>Register Account</h2>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748B', marginTop: '0', marginBottom: '24px' }}>Deploy credentials to AWS User Pool Directory</p>
              
              {authError && <div style={{ color: '#EF4444', background: '#451A03', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px' }}> {authError}</div>}
              
              <label style={labelStyle}>Email Identity</label>
              <input type="email" placeholder="yourname@domain.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              
              <label style={labelStyle}>Set Password</label>
              <input type="password" placeholder="Min. 8 chars, mixed case" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <button type="submit" style={{ ...btnStyle, backgroundColor: '#10B981' }}>Provision Node Credentials</button>
              
              <p style={{ textAlign: 'center', fontSize: '13px', marginTop: '20px', color: '#94A3B8' }}>
                Already provisioned? <span onClick={() => setAuthView('login')} style={{ color: '#38BDF8', cursor: 'pointer', fontWeight: '600' }}>Log In Instead</span>
              </p>
            </form>
          )}

          {/* VIEW C: COGNITO CODE VERIFICATION INTERFACE */}
          {authView === 'confirm' && (
            <form onSubmit={handleConfirmSignUp}>
              <h2 style={{ textAlign: 'center', color: '#F8FAFC' }}>Verify Security Node</h2>
              <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', marginBottom: '20px' }}>Input the 6-digit cryptographic registration code broadcasted to your email address.</p>
              
              {authError && <div style={{ color: '#EF4444', background: '#451A03', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px' }}> {authError}</div>}
              
              <input type="text" placeholder="Execution Verification PIN" value={confirmationCode} onChange={e => setConfirmationCode(e.target.value)} required style={{ ...inputStyle, textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }} />
              
              <button type="submit" style={btnStyle}>Authorize Node Allocation</button>
            </form>
          )}

          {/* VIEW D: FORGOT PASSWORD REQUEST INTERFACE */}
          {authView === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <h2 style={{ textAlign: 'center', marginBottom: '8px', color: '#F8FAFC' }}>Reset Password Sequence</h2>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748B', marginTop: '0', marginBottom: '24px' }}>Provide your email to broadcast a recovery vector token</p>
              
              {authError && <div style={{ color: '#EF4444', background: '#451A03', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px' }}>⚠️ {authError}</div>}
              
              <label style={labelStyle}>Registered Email Address</label>
              <input type="email" placeholder="name@university.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              
              <button type="submit" style={btnStyle}>Transmit Verification Code</button>
              
              <p style={{ textAlign: 'center', fontSize: '13px', marginTop: '20px', color: '#94A3B8' }}>
                Remembered details? <span onClick={() => { setAuthError(''); setAuthView('login'); }} style={{ color: '#38BDF8', cursor: 'pointer', fontWeight: '600' }}>Back to Sign In</span>
              </p>
            </form>
          )}

          {/* VIEW E: FORGOT PASSWORD CONFIRMATION INTERFACE */}
          {authView === 'confirm_forgot' && (
            <form onSubmit={handleConfirmForgotPassword}>
              <h2 style={{ textAlign: 'center', color: '#F8FAFC', marginBottom: '8px' }}>Authorize Credential Shift</h2>
              <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', marginBottom: '20px' }}>Enter the recovery PIN sent to your inbox along with your new password matrix.</p>
              
              {authError && <div style={{ color: '#EF4444', background: '#451A03', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px' }}>⚠️ {authError}</div>}
              
              <label style={labelStyle}>Cryptographic Recovery PIN</label>
              <input type="text" placeholder="6-Digit PIN" value={confirmationCode} onChange={e => setConfirmationCode(e.target.value)} required style={{ ...inputStyle, textAlign: 'center', fontSize: '16px', letterSpacing: '2px' }} />
              
              <label style={labelStyle}>New Secure Password Matrix</label>
              <input type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={inputStyle} />
              
              <button type="submit" style={{ ...btnStyle, backgroundColor: '#10B981' }}>Confirm Password Overwrite</button>
            </form>
          )}

        </div>
      </div>
    );
  }

  // 3. Main Operational Dashboard View Route (Triggers when user clears security checkpoint)
  return (
    <div className="dashboard-app">
      <header className="dashboard-header">
        <div className="brand">
          <span className="logo-icon"></span>
          <div>
            <h1> AQI Rover Mission Control</h1>
            <p className="subtitle">Enterprise IoT Telemetry Architecture • Bachelor Thesis Project</p>
          </div>
        </div>
        
        {/* REFACTORED STATUS & DISPATCH CONTROLS AREA */}
        <div className="controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          <span style={{ fontSize: '12px', background: isGuest ? '#334155' : '#065F46', padding: '6px 12px', borderRadius: '20px', color: '#F8FAFC', fontWeight: '600', border: isGuest ? '1px solid #475569' : '1px solid #059669' }}>
            User Node: {isGuest ? "Guest Access Mode" : authUser?.username}
          </span>

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

          <button 
            onClick={handleLogout} 
            style={{ backgroundColor: '#1E293B', color: '#F1F5F9', border: '1px solid #475569', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#EF4444')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
          >
            {isGuest ? "Exit Guest Mode" : "Disconnect Identity"}
          </button>
        </div>
      </header>

      {error && <div className="error-alert"> {error}</div>}

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

        {/* SESSION SNAPSHOT MANAGEMENT AND HISTORIC AUDITING ENGINE */}
        {(!isGuest && authUser) ? (
          <section className="chart-analytics-container" style={{ marginTop: '24px', border: '1px solid #10B981', padding: '24px', borderRadius: '8px', backgroundColor: '#064E3B10' }}>
            <h2 style={{ color: '#34D399', marginBottom: '4px' }}>Session Management Terminal (Active Session)</h2>
            <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: 0, marginBottom: '20px' }}>
              Identity confirmed via AWS User Pool. Telemetry routes passing through this session can be archived to your persistent databases for chronological version comparison analysis.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              
              {/* Left Sub-Panel: Dynamic Vault Entry */}
              <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#F8FAFC' }}>Archive Current Active Run</h3>
                <label style={labelStyle}>Session Log Label</label>
                <input 
                  type="text" 
                  placeholder="e.g., Lab Sweep Room 2" 
                  value={sessionNameInput} 
                  onChange={e => setSessionNameInput(e.target.value)} 
                  style={inputStyle} 
                />
                <button 
                  onClick={saveCurrentSessionSnapshot} 
                  style={{ ...btnStyle, backgroundColor: '#10B981', color: '#FFF', margin: 0 }}
                >
                  Snapshot Current Stream Data
                </button>

                <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '14px' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>VAULTED ARCHIVES ({savedSessions.length})</span>
                  {savedSessions.length === 0 ? (
                    <em style={{ fontSize: '12px', color: '#475569' }}>No chronological sessions saved yet.</em>
                  ) : (
                    <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                      {savedSessions.map(s => (
                        <li key={s.id} style={{ marginBottom: '4px' }}>
                          <strong>{s.name}</strong> ({s.stream.length} matrix points)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right Sub-Panel: Uncertainty Matrix Computations */}
              <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#F8FAFC' }}>Cross-Session Adjacency Uncertainty Audit</h3>
                <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748B' }}>Select two recorded historical sessions to extract and compare zones where neighboring cells breached the 35 AQI gradient limit.</p>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Baseline (Session A)</label>
                    <select 
                      value={selectedSessionA} 
                      onChange={e => setSelectedSessionA(e.target.value)} 
                      style={{ ...inputStyle, marginBottom: 0 }}
                    >
                      <option value="">-- Choose Session A --</option>
                      {savedSessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Comparison (Session B)</label>
                    <select 
                      value={selectedSessionB} 
                      onChange={e => setSelectedSessionB(e.target.value)} 
                      style={{ ...inputStyle, marginBottom: 0 }}
                    >
                      <option value="">-- Choose Session B --</option>
                      {savedSessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Computational Matrix Sub-Terminal */}
                <div style={{ backgroundColor: '#0F172A', borderRadius: '6px', padding: '14px', flex: 1, overflowY: 'auto', minHeight: '160px' }}>
                  {!sessionAData || !sessionBData ? (
                    <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
                      Awaiting node pairing. Select two saved sessions above to compute structural shift differentials.
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#38BDF8', fontSize: '13px' }}>Comparative Metrics:</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E2E8F0', fontSize: '12px', marginBottom: '14px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155', textTransform: 'uppercase', color: '#64748B', fontSize: '11px' }}>
                            <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Metrics</th>
                            <th style={{ textAlign: 'center', paddingBottom: '6px' }}>{sessionAData.name}</th>
                            <th style={{ textAlign: 'center', paddingBottom: '6px' }}>{sessionBData.name}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #1E293B' }}>
                            <td style={{ padding: '6px 0', color: '#94A3B8' }}>Captured Map Footprint</td>
                            <td style={{ textAlign: 'center' }}>{sessionAData.stream.length} packets</td>
                            <td style={{ textAlign: 'center' }}>{sessionBData.stream.length} packets</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '6px 0', color: '#F97316' }}>High Uncertainty Zones (Δ ≥ 35)</td>
                            <td style={{ textAlign: 'center', color: '#F97316', fontWeight: 'bold' }}>{anomaliesA.length} flagged</td>
                            <td style={{ textAlign: 'center', color: '#F97316', fontWeight: 'bold' }}>{anomaliesB.length} flagged</td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 style={{ margin: '12px 0 6px 0', color: '#F8FAFC', fontSize: '12px' }}>Structural Shift Anomaly Identification:</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: '#1E293B', padding: '10px', borderRadius: '4px', border: '1px solid #233044' }}>
                          <span style={{ color: '#64748B', fontSize: '11px', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>SESSION A ANOMALIES:</span>
                          {anomaliesA.length === 0 ? <span style={{color: '#475569', fontSize: '12px'}}>None detected.</span> : anomaliesA.slice(0, 3).map((an, i) => (
                            <div key={i} style={{fontSize: '11px', marginTop: '4px', color: '#E2E8F0'}}>{an.cell1} ↔ {an.cell2} (<strong>{an.delta} PPM</strong>)</div>
                          ))}
                        </div>
                        <div style={{ background: '#1E293B', padding: '10px', borderRadius: '4px', border: '1px solid #233044' }}>
                          <span style={{ color: '#64748B', fontSize: '11px', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>SESSION B ANOMALIES:</span>
                          {anomaliesB.length === 0 ? <span style={{color: '#475569', fontSize: '12px'}}>None detected.</span> : anomaliesB.slice(0, 3).map((an, i) => (
                            <div key={i} style={{fontSize: '11px', marginTop: '4px', color: '#E2E8F0'}}>{an.cell1} ↔ {an.cell2} (<strong>{an.delta} PPM</strong>)</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </section>
        ) : (
          <section className="chart-analytics-container" style={{ marginTop: '24px', border: '1px dashed #475569', padding: '24px', borderRadius: '8px', backgroundColor: '#1E293B40', opacity: 0.6 }}>
            <h2 style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '8px' }}> Advanced Metric Comparisons (Locked)</h2>
            <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0 0' }}>
              Session history storage and spatial adjacency uncertainty comparison operations are restricted. Create an authenticated token profile via AWS User Pool infrastructure to record and compare data sweeps.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── STYLING CORE SCHEMATICS ──────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#94A3B8', marginBottom: '6px', fontWeight: '700' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #334155', background: '#0F172A', color: '#F8FAFC', boxSizing: 'border-box', fontSize: '14px' };
const btnStyle: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: '6px', border: 'none', background: '#0284C7', color: '#F8FAFC', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px', fontSize: '14px', transition: 'background 0.2s' };