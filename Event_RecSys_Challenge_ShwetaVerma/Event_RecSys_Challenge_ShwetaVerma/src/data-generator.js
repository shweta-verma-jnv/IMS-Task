/**
 * Data generation script for event recommendation algorithm testing
 * Generates 10K users, events, and relevant similarity data
 */

// Configuration
const NUM_USERS = 10000;
const NUM_EVENTS = 2000;
const NUM_CATEGORIES = 20;
const MAX_PREFERENCES_PER_USER = 5;
const MAX_ATTENDED_EVENTS_PER_USER = 15;
const MAX_SIMILAR_EVENTS = 8;

// Helper functions
const generateRandomId = (prefix, index) => `${prefix}_${index}`;
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomFloat = (min, max) => Math.random() * (max - min) + min;
const pickRandomElements = (array, count) => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// Generate categories
const generateCategories = (count) => {
    const baseCategories = [
        'music', 'technology', 'food', 'sports', 'art', 'business',
        'education', 'health', 'travel', 'fashion', 'gaming', 'literature',
        'movies', 'politics', 'science', 'photography', 'dance', 'charity',
        'family', 'finance', 'history', 'pets', 'religion', 'beauty',
        'automotive', 'environment', 'crafts', 'comedy'
    ];

    // If we need more than we have in base categories, we'll combine some
    if (count <= baseCategories.length) {
        return baseCategories.slice(0, count);
    } else {
        // Add combined categories
        const categories = [...baseCategories];
        while (categories.length < count) {
            const cat1 = baseCategories[Math.floor(Math.random() * baseCategories.length)];
            const cat2 = baseCategories[Math.floor(Math.random() * baseCategories.length)];
            if (cat1 !== cat2) {
                categories.push(`${cat1}-${cat2}`);
            }
        }
        return categories.slice(0, count);
    }
};

// Generate location within bounds (roughly continental US)
const generateLocation = () => {
    return {
        lat: getRandomFloat(25, 49),  // US latitude range approximately
        lng: getRandomFloat(-124, -66)  // US longitude range approximately
    };
};

// Generate all data
const generateData = () => {
    console.time('Data generation');

    // Generate categories
    const categories = generateCategories(NUM_CATEGORIES);
    console.log(`Generated ${categories.length} categories`);

    // Generate events
    const events = [];
    for (let i = 0; i < NUM_EVENTS; i++) {
        const numCategories = getRandomInt(1, 3);
        events.push({
            id: generateRandomId('event', i),
            title: `Event ${i}`,
            categories: pickRandomElements(categories, numCategories),
            location: generateLocation(),
            popularity: getRandomFloat(0, 1)
        });
    }
    console.log(`Generated ${events.length} events`);

    // Generate event similarity mappings
    const eventSimilarity = {};
    events.forEach(event => {
        // Find events with at least one matching category
        const similarEvents = events
            .filter(e =>
                e.id !== event.id &&
                e.categories.some(cat => event.categories.includes(cat))
            )
            .map(e => e.id);

        // Take a subset of those similar events
        const numSimilar = Math.min(similarEvents.length, getRandomInt(1, MAX_SIMILAR_EVENTS));
        eventSimilarity[event.id] = pickRandomElements(similarEvents, numSimilar);
    });
    console.log(`Generated event similarity mappings`);

    // Generate users
    const users = [];
    for (let i = 0; i < NUM_USERS; i++) {
        const numPreferences = getRandomInt(1, MAX_PREFERENCES_PER_USER);
        const numAttended = getRandomInt(0, MAX_ATTENDED_EVENTS_PER_USER);

        users.push({
            id: generateRandomId('user', i),
            location: generateLocation(),
            preferences: pickRandomElements(categories, numPreferences),
            attendedEvents: pickRandomElements(events.map(e => e.id), numAttended)
        });

        // Progress update for large generations
        if (i % 1000 === 0) {
            console.log(`Generated ${i} users...`);
        }
    }
    console.log(`Generated ${users.length} users`);

    console.timeEnd('Data generation');

    return {
        users,
        events,
        eventSimilarity,
        categories
    };
};

// Generate the data
const data = generateData();

// Display sample data
console.log('\n--- SAMPLE DATA ---');
console.log('Sample User:', data.users[0]);
console.log('Sample Event:', data.events[0]);
console.log('Sample Event Similarity:', Object.entries(data.eventSimilarity)[0]);

console.log('\n--- Writing DATA ---');
const fs = require('fs');
fs.writeFileSync('../event_recommendation_data.json', JSON.stringify(data, null, 2));
console.log('Data saved to event_recommendation_data.json');

