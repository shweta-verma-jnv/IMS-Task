/**
 * Test file for event recommendation algorithm
 * This script evaluates your implementation and provides performance metrics
 */

const fs = require('fs');
const path = require('path');
const { calculateDistance, getRecommendedEvents } = require('./src/index');

// Load test data
console.log('Loading test data...');
const data = JSON.parse(fs.readFileSync('./event_recommendation_data.json', 'utf8'));
const { users, events, eventSimilarity } = data;

console.log(`Loaded ${users.length} users and ${events.length} events`);

// Function to create an event lookup map for faster access
function createEventMap(events) {
    const eventMap = new Map();
    events.forEach(event => {
        eventMap.set(event.id, event);
    });
    return eventMap;
}

const eventMap = createEventMap(events);

// Test distance calculation
function testDistanceCalculation() {
    console.log('\n--- TESTING DISTANCE CALCULATION ---');

    const testCases = [
        {
            point1: { lat: 40.7128, lng: -74.0060 }, // NYC
            point2: { lat: 34.0522, lng: -118.2437 }, // LA
            expectedApprox: 3935 // km
        },
        {
            point1: { lat: 51.5074, lng: -0.1278 }, // London
            point2: { lat: 48.8566, lng: 2.3522 }, // Paris
            expectedApprox: 334 // km
        },
        {
            point1: { lat: 37.7749, lng: -122.4194 }, // San Francisco
            point2: { lat: 37.7749, lng: -122.4194 }, // Same point
            expectedApprox: 0 // km
        }
    ];

    testCases.forEach((testCase, i) => {
        const distance = calculateDistance(testCase.point1, testCase.point2);
        const tolerance = testCase.expectedApprox * 0.05; // 5% tolerance
        const withinTolerance = Math.abs(distance - testCase.expectedApprox) <= tolerance;

        console.log(`Test ${i + 1}: Distance between points: ${distance.toFixed(2)} km`);
        console.log(`  Expected ~${testCase.expectedApprox} km. Result: ${withinTolerance ? 'PASS ✓' : 'FAIL ❌'}`);

        if (!withinTolerance) {
            console.log(`  Points: (${testCase.point1.lat}, ${testCase.point1.lng}) and (${testCase.point2.lat}, ${testCase.point2.lng})`);
        }
    });
}

// Test recommendation function with various scenarios
function testRecommendations() {
    console.log('\n--- TESTING RECOMMENDATION ALGORITHM ---');

    // Test case 1: Normal user with attended events and preferences
    const normalUser = users[0];
    console.log(`\nTest Case 1: Normal user with ${normalUser.attendedEvents.length} attended events`);
    console.log(`User ID: ${normalUser.id}`);
    console.log(`Preferences: ${normalUser.preferences.join(', ')}`);
    console.log('Previously attended events:');
    normalUser.attendedEvents.slice(0, 3).forEach(eventId => {
        const event = eventMap.get(eventId);
        if (event) {
            console.log(`  - ${event.id}: ${event.title} (Categories: ${event.categories.join(', ')})`);
        }
    });

    console.time('Normal user recommendation time');
    const normalRecommendations = getRecommendedEvents(normalUser, events, eventSimilarity, 5);
    console.timeEnd('Normal user recommendation time');

    console.log('Top recommendations:');
    normalRecommendations.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.title} (Categories: ${event.categories.join(', ')})`);
    });

    // Test case 2: User with no attended events
    const noHistoryUser = { ...users[1], attendedEvents: [] };
    console.log(`\nTest Case 2: User with no attended events`);
    console.log(`User ID: ${noHistoryUser.id}`);
    console.log(`Preferences: ${noHistoryUser.preferences.join(', ')}`);

    console.time('No history user recommendation time');
    const noHistoryRecommendations = getRecommendedEvents(noHistoryUser, events, eventSimilarity, 5);
    console.timeEnd('No history user recommendation time');

    console.log('Top recommendations:');
    noHistoryRecommendations.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.title} (Categories: ${event.categories.join(', ')})`);
    });

    // Test case 3: User with no preferences
    const noPreferencesUser = { ...users[2], preferences: [] };
    console.log(`\nTest Case 3: User with no preferences`);
    console.log(`User ID: ${noPreferencesUser.id}`);
    console.log(`Attended events: ${noPreferencesUser.attendedEvents.length}`);

    console.time('No preferences user recommendation time');
    const noPreferencesRecommendations = getRecommendedEvents(noPreferencesUser, events, eventSimilarity, 5);
    console.timeEnd('No preferences user recommendation time');

    console.log('Top recommendations:');
    noPreferencesRecommendations.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.title} (Categories: ${event.categories.join(', ')})`);
    });

    // Test case 4: Completely new user (no history or preferences)
    const newUser = {
        id: "new_user_1",
        location: { lat: 40.7128, lng: -74.0060 }, // NYC
        preferences: [],
        attendedEvents: []
    };

    console.log(`\nTest Case 4: Completely new user`);
    console.log(`User location: (${newUser.location.lat}, ${newUser.location.lng})`);

    console.time('New user recommendation time');
    const newUserRecommendations = getRecommendedEvents(newUser, events, eventSimilarity, 5);
    console.timeEnd('New user recommendation time');

    console.log('Top recommendations:');
    newUserRecommendations.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.title} (Categories: ${event.categories.join(', ')})`);
    });
}

// Test performance with 100 random users
function testPerformance() {
    console.log('\n--- PERFORMANCE TESTING ---');

    // Get 100 random users
    const testUsers = [];
    for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * users.length);
        testUsers.push(users[randomIndex]);
    }

    console.log(`Testing performance with ${testUsers.length} random users`);

    console.time('Total recommendation time');
    let totalEvents = 0;

    testUsers.forEach((user, i) => {
        if (i % 10 === 0) process.stdout.write('.');
        const recommendations = getRecommendedEvents(user, events, eventSimilarity, 5);
        totalEvents += recommendations.length;
    });

    console.log('\nGenerated recommendations for 100 users');
    console.timeEnd('Total recommendation time');
    console.log(`Average events recommended: ${(totalEvents / testUsers.length).toFixed(2)}`);
}

testDistanceCalculation();
testRecommendations();