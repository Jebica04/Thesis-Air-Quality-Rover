import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';

void main() => runApp(const RoverApp());

class RoverApp extends StatelessWidget {
  const RoverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AQI Rover Mission Control',
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        cardTheme: const CardThemeData(
          color: Color(0xFF1E293B),
          elevation: 0,
        ),
      ),
      home: const DashboardPage(),
    );
  }
}

// Centralized AQI Helper Structure to map rules across the architecture
class AQIDetails {
  final String label;
  final Color color;
  final Color textColor;

  const AQIDetails({
    required this.label,
    required this.color,
    required this.textColor,
  });
}

AQIDetails getAQIDetails(int ppm) {
  if (ppm <= 50) {
    return const AQIDetails(label: 'GOOD', color: Color(0xFF10B981), textColor: Colors.white);
  }
  if (ppm <= 100) {
    return const AQIDetails(label: 'MODERATE', color: Color(0xFFFBBF24), textColor: Color(0xFF0F172A));
  }
  if (ppm <= 150) {
    return const AQIDetails(label: 'UNHEALTHY (SG)', color: Color(0xFFF97316), textColor: Colors.white);
  }
  if (ppm <= 200) {
    return const AQIDetails(label: 'UNHEALTHY', color: Color(0xFFEF4444), textColor: Colors.white);
  }
  if (ppm <= 300) {
    return const AQIDetails(label: 'VERY UNHEALTHY', color: Color(0xFFA855F7), textColor: Colors.white);
  }
  return const AQIDetails(label: 'HAZARDOUS', color: Color(0xFF7F1D1D), textColor: Colors.white);
}

// Unified Telemetry Structure matching the Web App Schema with Spatial Context
class RoverTelemetry {
  final String deviceId;
  final int timestamp;
  final int airQualityPpm;
  final double sensorVoltage;
  final String status;
  final int x;
  final int y;

  RoverTelemetry({
    required this.deviceId,
    required this.timestamp,
    required this.airQualityPpm,
    required this.sensorVoltage,
    required this.status,
    required this.x,
    required this.y,
  });

  factory RoverTelemetry.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    
    return RoverTelemetry(
      deviceId: data['device_id'] ?? 'ROVER-01-THESIS',
      timestamp: data['timestamp'] ?? 0,
      airQualityPpm: (data['air_quality_ppm'] is num)
          ? (data['air_quality_ppm'] as num).toInt()
          : int.tryParse(data['air_quality_ppm']?.toString() ?? '0') ?? 0,
      sensorVoltage: (data['sensor_voltage'] is num) 
          ? (data['sensor_voltage'] as num).toDouble() 
          : double.tryParse(data['sensor_voltage']?.toString() ?? '0.0') ?? 0.0,
      status: data['status'] ?? 'GOOD',
      x: data['x'] != null ? (data['x'] as num).toInt() : 0,
      y: data['y'] != null ? (data['y'] as num).toInt() : 0,
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final String wsUrl = 'wss://0oac11f8x8.execute-api.eu-north-1.amazonaws.com/production/';
  
  List<RoverTelemetry> telemetryStream = [];
  bool isConnected = false;
  bool isUsingSimulator = true;
  WebSocket? _webSocket;
  Timer? _simulatorTimer;
  
  int simX = 0;
  int simY = 0;

  @override
  void initState() {
    super.initState();
    _orchestrateDataPipe();
  }

  void _orchestrateDataPipe() {
    _simulatorTimer?.cancel();
    _webSocket?.close();
    
    setState(() {
      isConnected = false;
      telemetryStream.clear();
    });

    if (isUsingSimulator) {
      setState(() {
        isConnected = true;
      });
      _simulatorTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
        final random = Random();
        
        // Simulates continuous spatial paths within the 12x12 localization space
        simX = (simX + (random.nextBool() ? 1 : 0)) % 12;
        simY = (simY + (random.nextBool() ? 1 : 0)) % 12;

        int ppm = random.nextInt(430) + 20; 
        AQIDetails tier = getAQIDetails(ppm);

        final mockPacket = RoverTelemetry(
          deviceId: "ROVER-01-SIM",
          timestamp: DateTime.now().millisecondsSinceEpoch ~/ 1000,
          airQualityPpm: ppm,
          sensorVoltage: double.parse((random.nextDouble() * (5.2 - 4.6) + 4.6).toStringAsFixed(2)),
          status: tier.label,
          x: simX,
          y: simY,
        );
        _appendNewFrame(mockPacket);
      });
    } else {
      _spinUpWebSocket();
    }
  }

  Future<void> _spinUpWebSocket() async {
    try {
      _webSocket = await WebSocket.connect(wsUrl).timeout(const Duration(seconds: 6));
      setState(() {
        isConnected = true;
      });

      _webSocket!.listen(
        (message) {
          try {
            final Map<String, dynamic> rawJson = jsonDecode(message);
            final packet = RoverTelemetry.fromJson(rawJson);
            _appendNewFrame(packet);
          } catch (err) {
            debugPrint("Corrupt payload structure skipped: $err");
          }
        },
        onDone: () => _triggerReconnectSequence(),
        onError: (err) => _triggerReconnectSequence(),
      );
    } catch (e) {
      _triggerReconnectSequence();
    }
  }

  void _triggerReconnectSequence() {
    if (!mounted) return;
    setState(() {
      isConnected = false;
    });
    if (!isUsingSimulator) {
      Future.delayed(const Duration(seconds: 5), () {
        _spinUpWebSocket();
      });
    }
  }

  void _appendNewFrame(RoverTelemetry packet) {
    if (!mounted) return;
    setState(() {
      telemetryStream.add(packet);
      if (telemetryStream.length > 50) {
        telemetryStream.removeAt(0);
      }
    });
  }

  String _formatTimestamp(int timestamp) {
    if (timestamp == 0) return '--:--:--';
    final dt = DateTime.fromMillisecondsSinceEpoch(timestamp * 1000);
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _simulatorTimer?.cancel();
    _webSocket?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final latest = telemetryStream.isNotEmpty ? telemetryStream.last : null;
    final chartDataWindow = telemetryStream.length > 12 
        ? telemetryStream.sublist(telemetryStream.length - 12) 
        : telemetryStream;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. HEADER TITLE BLOCK
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('🤖 AQI Rover Mission Control', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                      SizedBox(height: 2),
                      Text('Enterprise IoT Architecture Module', style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w500)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 2. CONNECTION FLUID OVERLAY CONTROLS
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isUsingSimulator ? const Color(0xFF1E293B) : const Color(0xFF0284C7),
                        side: isUsingSimulator ? const BorderSide(color: Color(0xFF38BDF8), width: 1.2) : BorderSide.none,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: () {
                        setState(() {
                          isUsingSimulator = !isUsingSimulator;
                          _orchestrateDataPipe();
                        });
                      },
                      child: Text(
                        isUsingSimulator ? "Local Simulator" : "Live AWS Cloud",
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    width: 95,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: isConnected ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      isConnected ? "Active" : "Offline",
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 13),
                    ),
                  )
                ],
              ),
              const SizedBox(height: 20),

              // 3. TELEMETRY SCALAR KPI DISPLAY CARDS
              _buildKpiCard("CURRENT GAS CONCENTRATION", latest != null ? "${latest.airQualityPpm}" : "---", "PPM", "Sensor Frame: MQ-135 Core Node", latest != null ? getAQIDetails(latest.airQualityPpm).color : const Color(0xFF38BDF8)),
              _buildKpiCard("BUS VOLTAGE LAYER", latest != null ? latest.sensorVoltage.toStringAsFixed(2) : "---", "V", "Power Domain: 5V Regulated Bus", const Color(0xFFFB923C)),
              _buildKpiCard("PIPELINE STREAM CACHE", "${telemetryStream.length}", "Pkts", "Stateful Local Memory Array Log", const Color(0xFF10B981)),
              const SizedBox(height: 20),

              // 4. REAL-TIME OSCILLOSCOPE GRAPH
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(14.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Real-Time Dynamic Oscilloscope Feed", style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                      const SizedBox(height: 14),
                      Container(
                        color: const Color(0xFF0F172A),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        width: double.infinity,
                        height: 200,
                        child: CustomPaint(
                          painter: OscilloscopePainter(chartDataWindow),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: const [
                          Text('■ Gas Quality (PPM)    ', style: TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold)),
                          Text('■ Grid Voltage (V)', style: TextStyle(color: Color(0xFFFB923C), fontSize: 11, fontWeight: FontWeight.bold)),
                        ],
                      )
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // 5. NEW SPATIAL HEATMAP GRID WIDGET MOUNT
              _buildSpatialHeatmapCard(),
              const SizedBox(height: 20),

              // 6. RESPONSE TELEMETRY CHRONO LOG WINDOW
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(14.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Real-Time Chronological Telemetry Stream Log", style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                      const SizedBox(height: 14),
                      
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                        decoration: const BoxDecoration(
                          border: Border(bottom: BorderSide(color: Color(0xFF334155), width: 1)),
                        ),
                        child: Row(
                          children: const [
                            Expanded(flex: 2, child: Text("Clock", style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold))),
                            Expanded(flex: 3, child: Text("Hardware Token", style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold))),
                            Expanded(flex: 2, child: Text("Gas Metrics", style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold), textAlign: TextAlign.right)),
                            Expanded(flex: 2, child: Text("Volt Check", style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold), textAlign: TextAlign.right)),
                            Expanded(flex: 3, child: Text("Diagnostics", style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold), textAlign: TextAlign.center)),
                          ],
                        ),
                      ),
                      
                      Container(
                        constraints: const BoxConstraints(maxHeight: 280),
                        child: telemetryStream.isEmpty
                            ? const Padding(
                                padding: EdgeInsets.symmetric(vertical: 36),
                                child: Center(child: Text("Waiting for inbound telemetry frames...", style: TextStyle(color: Color(0xFF64748B), fontSize: 11))),
                              )
                            : ListView.builder(
                                shrinkWrap: true,
                                padding: EdgeInsets.zero,
                                itemCount: telemetryStream.length,
                                itemBuilder: (context, index) {
                                  final frame = telemetryStream[telemetryStream.length - 1 - index];
                                  final tier = getAQIDetails(frame.airQualityPpm);

                                  return Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                                    decoration: const BoxDecoration(
                                      border: Border(bottom: BorderSide(color: Color(0xFF1E293B), width: 1)),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(flex: 2, child: Text(_formatTimestamp(frame.timestamp), style: const TextStyle(color: Colors.white, fontSize: 11))),
                                        Expanded(flex: 3, child: Text(frame.deviceId, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11), overflow: TextOverflow.ellipsis)),
                                        Expanded(
                                          flex: 2, 
                                          child: Text(
                                            "${frame.airQualityPpm} PPM", 
                                            style: TextStyle(color: tier.color, fontSize: 11, fontWeight: FontWeight.bold),
                                            textAlign: TextAlign.right,
                                          ),
                                        ),
                                        Expanded(
                                          flex: 2, 
                                          child: Text(
                                            "${frame.sensorVoltage.toStringAsFixed(2)} V", 
                                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                                            textAlign: TextAlign.right,
                                          ),
                                        ),
                                        Expanded(
                                          flex: 3, 
                                          child: Center(
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 6),
                                              decoration: BoxDecoration(
                                                color: tier.color.withOpacity(0.15),
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                tier.label, 
                                                style: TextStyle(color: tier.color, fontSize: 8.5, fontWeight: FontWeight.bold),
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // 📍 GRIDDED SPATIAL HEATMAP COMPONENT DESIGN (12x12 Matrix Engine)
  Widget _buildSpatialHeatmapCard() {
    const int gridSize = 12;
    // Pre-allocates -1 default state values indicating unexplored regions
    List<List<int>> matrix = List.generate(gridSize, (_) => List.filled(gridSize, -1));

    // Flatten packet queues directly into matching matrix slots
    for (var frame in telemetryStream) {
      int cx = frame.x.clamp(0, gridSize - 1);
      int cy = frame.y.clamp(0, gridSize - 1);
      matrix[cy][cx] = frame.airQualityPpm;
    }

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("📍 Real-Time Spatial Gas Distribution Mapping", style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(8),
              ),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: gridSize * gridSize,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: gridSize,
                  crossAxisSpacing: 3,
                  mainAxisSpacing: 3,
                ),
                itemBuilder: (context, index) {
                  // Invert row index tracking so (0,0) projects nicely at bottom-left corner
                  int rIndex = index ~/ gridSize;
                  int y = (gridSize - 1) - rIndex;
                  int x = index % gridSize;
                  
                  int aqiValue = matrix[y][x];
                  Color cellBgColor = const Color(0xFF1E293B); // Unvisited
                  Color textBlockColor = Colors.transparent;

                  if (aqiValue != -1) {
                    final tierConfig = getAQIDetails(aqiValue);
                    cellBgColor = tierConfig.color;
                    textBlockColor = tierConfig.textColor;
                  }

                  return Container(
                    decoration: BoxDecoration(
                      color: cellBgColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                    alignment: Alignment.center,
                    child: aqiValue == -1 
                        ? const SizedBox.shrink()
                        : Text(
                            "$aqiValue",
                            style: TextStyle(color: textBlockColor, fontSize: 8, fontWeight: FontWeight.bold),
                          ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            
            // Scaled Inline Footnotes Continuous Map Legend 
            Wrap(
              spacing: 10,
              runSpacing: 6,
              children: [
                _buildLegendLabel("Good (0-50)", const Color(0xFF10B981)),
                _buildLegendLabel("Mod (51-100)", const Color(0xFFFBBF24)),
                _buildLegendLabel("SG (101-150)", const Color(0xFFF97316)),
                _buildLegendLabel("Unhealthy (151-200)", const Color(0xFFEF4444)),
                _buildLegendLabel("Very Unhealthy (201-300)", const Color(0xFFA855F7)),
                _buildLegendLabel("Haz (301+)", const Color(0xFF7F1D1D)),
                _buildLegendLabel("Unvisited", const Color(0xFF1E293B)),
              ],
            )
          ],
        ),
      ),
    );
  }

  Widget _buildLegendLabel(String text, Color indicatorColor) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: indicatorColor, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _buildKpiCard(String label, String value, String unit, String subText, Color highlightColor) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF222F43), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(value, style: TextStyle(color: highlightColor, fontSize: 26, fontWeight: FontWeight.bold)),
              const SizedBox(width: 4),
              Text(unit, style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
            ],
          ),
          const SizedBox(height: 4),
          Text(subText, style: const TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class OscilloscopePainter extends CustomPainter {
  final List<RoverTelemetry> points;
  OscilloscopePainter(this.points);

  @override
  void paint(Canvas canvas, Size size) {
    double padL = 38; double padR = 38;
    double padT = 15; double padB = 15;
    double graphW = size.width - padL - padR;
    double graphH = size.height - padT - padB;

    double ppmMin = 0;   double ppmMax = 500;
    double voltMin = 0.0; double voltMax = 5.5;

    final gridPaint = Paint()..color = const Color(0xFF1E293B)..strokeWidth = 1..style = PaintingStyle.stroke;
    final textPainter = TextPainter(textDirection: TextDirection.ltr);

    for (int i = 0; i <= 4; i++) {
      double ratio = i / 4;
      double y = padT + ratio * graphH;
      canvas.drawLine(Offset(padL, y), Offset(size.width - padR, y), gridPaint);

      int ppmVal = (ppmMax - ratio * (ppmMax - ppmMin)).round();
      textPainter.text = TextSpan(text: "$ppmVal", style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 9, fontWeight: FontWeight.bold));
      textPainter.layout();
      textPainter.paint(canvas, Offset(padL - textPainter.width - 6, y - (textPainter.height / 2)));

      double voltVal = voltMax - ratio * (voltMax - voltMin);
      textPainter.text = TextSpan(text: "${voltVal.toStringAsFixed(1)}V", style: const TextStyle(color: Color(0xFFFB923C), fontSize: 9, fontWeight: FontWeight.bold));
      textPainter.layout();
      textPainter.paint(canvas, Offset(size.width - padR + 6, y - (textPainter.height / 2)));
    }

    if (points.length < 2) return;

    final ppmPath = Path();
    final voltPath = Path();

    for (int i = 0; i < points.length; i++) {
      double x = padL + (i / (points.length - 1)) * graphW;
      double ppmY = padT + graphH - ((points[i].airQualityPpm - ppmMin) / (ppmMax - ppmMin)) * graphH;
      double voltY = padT + graphH - ((points[i].sensorVoltage - voltMin) / (voltMax - voltMin)) * graphH;

      if (i == 0) {
        ppmPath.moveTo(x, ppmY);
        voltPath.moveTo(x, voltY);
      } else {
        ppmPath.lineTo(x, ppmY);
        voltPath.lineTo(x, voltY);
      }
    }

    final ppmPaint = Paint()..color = const Color(0xFF38BDF8)..strokeWidth = 3..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    final voltPaint = Paint()..color = const Color(0xFFFB923C)..strokeWidth = 2.5..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    final pointKnotPaint = Paint()..color = const Color(0xFF38BDF8)..style = PaintingStyle.fill;
    final pointCenterPaint = Paint()..color = const Color(0xFF0F172A)..style = PaintingStyle.fill;

    canvas.drawPath(ppmPath, ppmPaint);
    canvas.drawPath(voltPath, voltPaint);

    for (int i = 0; i < points.length; i++) {
      double x = padL + (i / (points.length - 1)) * graphW;
      double ppmY = padT + graphH - ((points[i].airQualityPpm - ppmMin) / (ppmMax - ppmMin)) * graphH;
      canvas.drawCircle(Offset(x, ppmY), 3.5, pointKnotPaint);
      canvas.drawCircle(Offset(x, ppmY), 1.5, pointCenterPaint);
    }
  }

  @override
  bool shouldRepaint(covariant OscilloscopePainter oldDelegate) => true;
}