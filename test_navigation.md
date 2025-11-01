# Arrow Key Navigation Test

## Test Steps:

1. Create several boxes with different colors:
   - Create 2-3 red boxes (priority 1)
   - Create 2-3 orange boxes (priority 2)  
   - Create 2-3 white boxes (priority 3)

2. Position them at different locations:
   - Place red boxes at various Y positions
   - Place orange boxes at various Y positions
   - Place white boxes at various Y positions

3. Test navigation:
   - Press arrow keys (UP/DOWN/LEFT/RIGHT) without editing any box
   - Verify that focus moves through RED boxes first
   - Then through ORANGE boxes
   - Then through WHITE boxes
   - Within each color group, verify top-to-bottom, left-to-right ordering

4. The selected box should have a blue outline
5. Camera should pan to show the selected box if it's out of view

## Color Values:
- Red: r=255, g=140, b=140
- Orange: r=255, g=200, b=140
- White: r=255, g=255, b=255

## Notes:
- Arrow keys only work when NOT editing text
- If a box is being edited, arrow keys move cursor within text
- To exit editing mode, click outside the box or press ESC
