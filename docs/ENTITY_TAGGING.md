# Entity Tagging in OpenMind

## Overview
The **Entity Tagging** feature enhances the `TextImporter` by automatically identifying and labeling key entities within imported text. This allows for a richer, more organized mind map where "People", "Places", and "Organizations" are visually distinguished at a glance.

## Feature Description
When a user imports a text file (.txt, .md), the system will:
1.  **Analyze**: Use Natural Language Processing (NLP) to scan the content.
2.  **Identify**: Extract entities belonging to three primary categories:
    *   **People**: Names of individuals.
    *   **Places**: Locations, cities, countries, landmarks.
    *   **Organizations**: Companies, institutions, groups.
3.  **Tag**: Add small, color-coded text labels (tags) above the resulting text boxes in the mind map.

## Visual Design
Tags are rendered as small text labels floating just above the top edge of the text box.
*   **Person Tag**: Standard color (e.g., Light Blue)
*   **Place Tag**: Standard color (e.g., Light Green)
*   **Organization Tag**: Standard color (e.g., Light Purple)

Example Layout:
```
 [ Person: Elon Musk ]
+---------------------+
| Elon Musk founded   |
| SpaceX in 2002.     |
+---------------------+
```

## Technical Implementation

### 1. NLP Engine
The system leverages the **Compromise** NLP library (already integrated in `TextImporter.js`) to perform entity recognition.
*   `nlp(text).people().out('array')`
*   `nlp(text).places().out('array')`
*   `nlp(text).organizations().out('array')`

### 2. Data Model
The `TextBox` class will be extended to support a `tags` array:
```javascript
this.tags = [
  { text: "Elon Musk", type: "person" },
  { text: "SpaceX", type: "organization" }
];
```

### 3. Rendering Logic
The `TextBox.draw()` method will be updated to include a `drawTags()` helper that:
*   Calculates the position above the box.
*   Renders a background pill/rect for each tag.
*   Displays the entity name and its type (optional).

### 4. Synchronization
The `CollaborationManager` will ensure that entity tags are synchronized across all clients by including the `tags` property in the Yjs shared state for each box.

## User Benefits
*   **Instant Context**: Quickly see the main actors and locations in a large text import.
*   **Visual Organization**: Consistent color-coding helps the brain categorize information faster.
*   **Enhanced Search/Filtering**: Future potential to filter the map by entity types.
