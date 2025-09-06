# Event Recommendation Algorithm Challenge

This repository contains a challenge for implementing an efficient event recommendation engine. Your task is to build an algorithm that suggests relevant events to users based on their preferences, past behavior, and location.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone this repository:
   ```
   git clone git@github.com:ims-learning-engineering/event-recommendation-challenge.git
   cd event-recommendation-challenge
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Challenge Description

You need to implement two functions in `src/index.js`:

1. `calculateDistance(point1, point2)`: Calculate the distance between two geographical points using the Haversine formula
2. `getRecommendedEvents(user, events, eventSimilarity, limit)`: Recommend events for a user based on multiple criteria

The repository contains a dataset of 10,000 users and 2,000 events in `event_recommendation_data.json`, which you should use to test your implementation.

### Requirements

Your implementation should:

1. Consider multiple factors:
   - Content-based filtering (recommend events similar to previously attended events)
   - User preferences (match with event categories)
   - Geographic proximity (distance between user and event locations)
   - Event popularity

2. Achieve O(n log n) time complexity or better

3. Return a sorted list of recommended event objects, with the most relevant first

### Testing Your Implementation

After implementing the functions, you can test your solution by running:

```
npm test
```

This will evaluate your algorithm on several test cases and measure its performance against the dataset.

## Repository Structure

```
├── event_recommendation_data.json  # Dataset with users, events, and similarity data
├── test.js                         
├── package.json                    # Project dependencies
└── src
    ├── data-generator.js           # Script that generated the dataset (for reference)
    └── index.js                    # Where you'll implement your solution
```

## Implementation Details

### The `calculateDistance` Function

```javascript
/**
 * Calculate distance between two geographical points using Haversine formula
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in kilometers
 */
function calculateDistance(point1, point2) {
  // Your implementation here
}
```

### The `getRecommendedEvents` Function

```javascript
/**
 * Recommend events for a user
 * @param {Object} user - User data including preferences and location
 * @param {Array} events - Array of event objects
 * @param {Object} eventSimilarity - Object mapping events to similar events
 * @param {number} limit - Maximum number of recommendations to return
 * @returns {Array} Array of recommended event objects
 */
function getRecommendedEvents(user, events, eventSimilarity, limit = 5) {
  // Your implementation here
}
```

## Data Format

### User Object

```javascript
{
  id: "user_123",
  location: { lat: 37.7749, lng: -122.4194 },
  preferences: ["technology", "business", "food"],
  attendedEvents: ["event_42", "event_156", "event_987"]
}
```

### Event Object

```javascript
{
  id: "event_42",
  title: "Tech Conference 2023",
  categories: ["technology", "business"],
  location: { lat: 37.7833, lng: -122.4167 },
  popularity: 0.85
}
```

### Event Similarity Object

```javascript
{
  "event_42": ["event_67", "event_103", "event_218"],
  "event_156": ["event_89", "event_212"]
  // ... more mappings
}
```

## Evaluation Criteria

Your submission will be evaluated based on:

1. **Correctness**: Does the algorithm return relevant recommendations?
2. **Efficiency**: Does it meet the O(n log n) time complexity requirement?
3. **Code quality**: Is your code clean, well-structured, and documented?
4. **Approach**: Is your solution well-justified with proper comments explaining the approach?
5. **Edge cases**: How well does your algorithm handle edge cases?

## Tips for Success

- Consider how to weight different factors in your recommendation algorithm
- Remember to handle cases where a user has no attended events or preferences
- Be thoughtful about computational efficiency with large datasets
- Document your approach and any assumptions made
- Think about how to avoid recommending events the user has already attended

Good luck with your implementation!