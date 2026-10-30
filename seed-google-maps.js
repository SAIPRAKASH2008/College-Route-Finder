const { dbAsync } = require('./config/db');

const newGoogleMapsStops = [
  { name: 'Majestic (KSR) Central Bus Terminal', lat: 12.9774, lng: 77.5708, is_college: 0 },
  { name: 'MG Road Boulevard & Metro', lat: 12.9753, lng: 77.6066, is_college: 0 },
  { name: 'Indiranagar 100ft Road Hub', lat: 12.9784, lng: 77.6408, is_college: 0 },
  { name: 'Koramangala Sony World Junction', lat: 12.9352, lng: 77.6245, is_college: 0 },
  { name: 'HSR Layout BDA Complex', lat: 12.9116, lng: 77.6389, is_college: 0 },
  { name: 'Silk Board Junction Interchange', lat: 12.9172, lng: 77.6228, is_college: 0 },
  { name: 'Electronic City Phase 1 Hub', lat: 12.8452, lng: 77.6602, is_college: 0 },
  { name: 'Jayanagar 4th Block Complex', lat: 12.9299, lng: 77.5824, is_college: 0 },
  { name: 'Banashankari TTMC Hub', lat: 12.9155, lng: 77.5736, is_college: 0 },
  { name: 'Malleshwaram 8th Cross Circle', lat: 13.0031, lng: 77.5702, is_college: 0 },
  { name: 'Yeshwanthpur Transit Terminal', lat: 13.0232, lng: 77.5503, is_college: 0 },
  { name: 'Rajajinagar 1st Block Entrance', lat: 12.9982, lng: 77.5530, is_college: 0 },
  { name: 'Hebbal Flyover Transit Junction', lat: 13.0358, lng: 77.5970, is_college: 0 },
  { name: 'Marathahalli Multiplex Bridge', lat: 12.9591, lng: 77.6974, is_college: 0 },
  { name: 'Whitefield ITPL Main Gate', lat: 12.9863, lng: 77.7289, is_college: 0 },
  { name: 'Bellandur EcoSpace Tech Hub', lat: 12.9260, lng: 77.6762, is_college: 0 }
];

const edgeConnections = [
  ['Majestic (KSR) Central Bus Terminal', 'College Main Campus (Central Terminal)', 3.2],
  ['Majestic (KSR) Central Bus Terminal', 'Stop A - North Town Circle', 1.6],
  ['Majestic (KSR) Central Bus Terminal', 'Malleshwaram 8th Cross Circle', 3.8],
  ['Majestic (KSR) Central Bus Terminal', 'Rajajinagar 1st Block Entrance', 3.5],
  ['MG Road Boulevard & Metro', 'College Main Campus (Central Terminal)', 1.8],
  ['MG Road Boulevard & Metro', 'Stop B - Metro Junction', 2.0],
  ['MG Road Boulevard & Metro', 'Stop C - City Square Market', 1.5],
  ['MG Road Boulevard & Metro', 'Indiranagar 100ft Road Hub', 4.2],
  ['Indiranagar 100ft Road Hub', 'Stop B - Metro Junction', 4.8],
  ['Indiranagar 100ft Road Hub', 'Stop D - Tech Park Boulevard', 3.9],
  ['Indiranagar 100ft Road Hub', 'Marathahalli Multiplex Bridge', 6.8],
  ['Marathahalli Multiplex Bridge', 'Whitefield ITPL Main Gate', 4.9],
  ['Marathahalli Multiplex Bridge', 'Bellandur EcoSpace Tech Hub', 4.6],
  ['Bellandur EcoSpace Tech Hub', 'Silk Board Junction Interchange', 6.5],
  ['Bellandur EcoSpace Tech Hub', 'HSR Layout BDA Complex', 4.4],
  ['Koramangala Sony World Junction', 'Stop D - Tech Park Boulevard', 2.2],
  ['Koramangala Sony World Junction', 'Silk Board Junction Interchange', 2.6],
  ['Koramangala Sony World Junction', 'HSR Layout BDA Complex', 3.1],
  ['Koramangala Sony World Junction', 'Jayanagar 4th Block Complex', 5.2],
  ['Silk Board Junction Interchange', 'Electronic City Phase 1 Hub', 9.5],
  ['Silk Board Junction Interchange', 'HSR Layout BDA Complex', 2.1],
  ['Silk Board Junction Interchange', 'Banashankari TTMC Hub', 6.1],
  ['Silk Board Junction Interchange', 'Jayanagar 4th Block Complex', 4.8],
  ['Jayanagar 4th Block Complex', 'Banashankari TTMC Hub', 2.4],
  ['Jayanagar 4th Block Complex', 'Stop E - Lake View Residency', 1.6],
  ['Banashankari TTMC Hub', 'Stop E - Lake View Residency', 3.2],
  ['Malleshwaram 8th Cross Circle', 'Yeshwanthpur Transit Terminal', 3.1],
  ['Malleshwaram 8th Cross Circle', 'Stop A - North Town Circle', 2.8],
  ['Malleshwaram 8th Cross Circle', 'Rajajinagar 1st Block Entrance', 2.2],
  ['Malleshwaram 8th Cross Circle', 'Hebbal Flyover Transit Junction', 4.7],
  ['Hebbal Flyover Transit Junction', 'Yeshwanthpur Transit Terminal', 5.8],
  ['Hebbal Flyover Transit Junction', 'Stop B - Metro Junction', 5.4],
  ['Rajajinagar 1st Block Entrance', 'Yeshwanthpur Transit Terminal', 2.9],
  ['Rajajinagar 1st Block Entrance', 'Stop A - North Town Circle', 3.4],
  ['College Main Campus (Central Terminal)', 'Stop C - City Square Market', 2.1],
  ['College Main Campus (Central Terminal)', 'Stop E - Lake View Residency', 4.2]
];

async function seedLocations() {
  console.log('🌍 Seeding Google Maps locations and interconnected road network...');
  let addedStops = 0;
  for (const s of newGoogleMapsStops) {
    const existing = await dbAsync.get('SELECT id FROM stops WHERE LOWER(name) = LOWER(?)', [s.name]);
    if (!existing) {
      await dbAsync.run(
        'INSERT INTO stops (name, latitude, longitude, is_college) VALUES (?, ?, ?, ?)',
        [s.name, s.lat, s.lng, s.is_college]
      );
      addedStops++;
    }
  }
  console.log(`✅ Added ${addedStops} new Google Maps stops.`);

  // Load all stops mapping name -> id
  const allStops = await dbAsync.all('SELECT id, name FROM stops');
  const stopMap = {};
  for (const s of allStops) {
    stopMap[s.name.toLowerCase().trim()] = s.id;
  }

  let addedEdges = 0;
  for (const [fromName, toName, dist] of edgeConnections) {
    const u = stopMap[fromName.toLowerCase().trim()];
    const v = stopMap[toName.toLowerCase().trim()];
    if (!u || !v) {
      console.warn(`⚠️ Could not find stops for edge: ${fromName} <-> ${toName}`);
      continue;
    }

    // Check if edge exists in either direction
    const existingEdge = await dbAsync.get(
      'SELECT id FROM edges WHERE (source_stop_id = ? AND dest_stop_id = ?) OR (source_stop_id = ? AND dest_stop_id = ?)',
      [u, v, v, u]
    );

    if (!existingEdge) {
      await dbAsync.run(
        'INSERT INTO edges (source_stop_id, dest_stop_id, distance_km) VALUES (?, ?, ?)',
        [u, v, dist]
      );
      addedEdges++;
    }
  }

  console.log(`✅ Added ${addedEdges} new road connections.`);
  const totalStops = await dbAsync.get('SELECT COUNT(*) as count FROM stops');
  const totalEdges = await dbAsync.get('SELECT COUNT(*) as count FROM edges');
  console.log(`📊 Total Network: ${totalStops.count} stops, ${totalEdges.count} edges.`);
}

seedLocations().then(() => {
  console.log('🎉 Done seeding Google Maps locations!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error seeding locations:', err);
  process.exit(1);
});
