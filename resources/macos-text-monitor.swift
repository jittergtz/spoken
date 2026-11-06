import Cocoa
import Carbon
import Foundation
import Darwin

let TIMEOUT_SECONDS: Double = 30.0
let MAX_OUTPUT_BYTES = 10240
let MAX_BASE64_SOURCE_CHARS = 7000

var monitoredElement: AXUIElement?
var observer: AXObserver?
var monitoredPid: pid_t = 0

func writeOutput(_ message: String) {
    FileHandle.standardOutput.write((message + "\n").data(using: .utf8)!)
    fflush(stdout)
}

func writeError(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

func writeTextOutput(_ prefix: String, _ value: String) {
    let truncated = String(value.prefix(MAX_OUTPUT_BYTES))
    if truncated.contains("\n") || truncated.contains("\r") {
        let capped = String(truncated.prefix(MAX_BASE64_SOURCE_CHARS))
        let encoded = Data(capped.utf8).base64EncodedString()
        writeOutput("\(prefix)_B64:\(encoded)")
        return
    }

    writeOutput("\(prefix):\(truncated)")
}

func readCurrentValue() -> String? {
    guard let element = monitoredElement else { return nil }
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value)
    guard result == .success, let str = value as? String else { return nil }
    return str
}

func observerCallback(
    _ observer: AXObserver,
    _ element: AXUIElement,
    _ notification: CFString,
    _ refcon: UnsafeMutableRawPointer?
) {
    if let value = readCurrentValue() {
        writeTextOutput("CHANGED", value)
    }
}

private struct GrammarField {
    let focus: AXUIElement
    let element: AXUIElement
    let text: String
    let selection: CFRange?
    let reportedSelection: CFRange?
    let textToCorrect: String
    let singleLine: Bool
    let canSetValue: Bool
}

private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

private func isSettable(_ element: AXUIElement, _ name: String) -> Bool {
    var settable: DarwinBoolean = false
    return AXUIElementIsAttributeSettable(element, name as CFString, &settable) == .success
        && settable.boolValue
}

private func elementAttribute(_ element: AXUIElement, _ name: String, pid: pid_t) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else {
        return nil
    }
    let target = value as! AXUIElement
    var targetPid: pid_t = 0
    return AXUIElementGetPid(target, &targetPid) == .success && targetPid == pid ? target : nil
}

private func grammarFocus(_ system: AXUIElement, _ app: AXUIElement, pid: pid_t) -> AXUIElement? {
    guard !IsSecureEventInputEnabled(),
          NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
          var focused = elementAttribute(app, kAXFocusedUIElementAttribute, pid: pid)
              ?? elementAttribute(system, kAXFocusedUIElementAttribute, pid: pid) else { return nil }

    // Web content can report its web area as focused before resolving the editor inside it.
    for _ in 0..<4 {
        let role = attribute(focused, kAXRoleAttribute) as? String
        guard role == "AXWebArea" || role == kAXGroupRole || role == kAXWindowRole,
              let child = elementAttribute(focused, kAXFocusedUIElementAttribute, pid: pid),
              !CFEqual(child, focused) else { break }
        focused = child
    }
    return focused
}

private func isProtected(_ element: AXUIElement) -> Bool {
    return (attribute(element, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole
        || (attribute(element, kAXEnabledAttribute) as? Bool) == false
}

private func grammarField(_ focused: AXUIElement, pid: pid_t) -> GrammarField? {
    guard !isProtected(focused) else { return nil }
    let focusedRole = attribute(focused, kAXRoleAttribute) as? String
    let element: AXUIElement
    if focusedRole == kAXTextFieldRole || focusedRole == kAXTextAreaRole {
        element = focused
    } else {
        element = elementAttribute(focused, "AXEditableAncestor", pid: pid) ?? focused
    }
    guard !isProtected(element) else { return nil }
    let role = attribute(element, kAXRoleAttribute) as? String
    let canSetValue = isSettable(element, kAXValueAttribute)
    let editable = attribute(element, "AXEditable") as? Bool
    guard editable != false, editable == true || canSetValue,
          role == kAXTextFieldRole || role == kAXTextAreaRole || role == kAXGroupRole else {
        return nil
    }

    var selectionValue: CFTypeRef?
    let selectionResult = AXUIElementCopyAttributeValue(
        element, kAXSelectedTextRangeAttribute as CFString, &selectionValue
    )
    var range = CFRange()
    let hasRange: Bool
    if selectionResult == .success, let selectionValue = selectionValue,
       CFGetTypeID(selectionValue) == AXValueGetTypeID() {
        hasRange = AXValueGetValue(selectionValue as! AXValue, .cfRange, &range)
            && range.location >= 0 && range.length >= 0
    } else {
        hasRange = false
    }
    let caretLine = { attribute(element, kAXInsertionPointLineNumberAttribute) as? Int ?? -1 }
    guard role != kAXGroupRole || hasRange || caretLine() >= 0 else { return nil }

    let value = attribute(element, kAXValueAttribute) as? String
    let selected = attribute(element, kAXSelectedTextAttribute) as? String
    let input: String
    var verifiedRange: CFRange?
    if let selected = selected, !selected.isEmpty {
        input = selected
        if hasRange, let value = value, range.location <= value.utf16.count,
           range.length <= value.utf16.count - range.location,
           let indices = Range(NSRange(location: range.location, length: range.length), in: value),
           value[indices].utf16.elementsEqual(selected.utf16) {
            verifiedRange = range
        }
    } else if let value = value, hasRange, range.length == 0 {
        input = value
        if range.location <= value.utf16.count { verifiedRange = range }
    } else if let value = value, !hasRange,
              selected == "" || (selectionResult == .noValue && caretLine() >= 0) {
        // Gecko can expose the caret and editor value before providing a selection range.
        input = value
    } else {
        return nil
    }

    guard !IsSecureEventInputEnabled(),
          NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { return nil }

    return GrammarField(
        focus: focused, element: element, text: value ?? "", selection: verifiedRange,
        reportedSelection: hasRange ? range : nil,
        textToCorrect: input,
        singleLine: role == kAXTextFieldRole && CFEqual(focused, element)
            && input.rangeOfCharacter(from: .newlines) == nil
            && value?.rangeOfCharacter(from: .newlines) == nil,
        canSetValue: canSetValue
    )
}

private func sameTextField(_ original: GrammarField, _ current: GrammarField) -> Bool {
    return CFEqual(original.focus, current.focus) && CFEqual(original.element, current.element)
        && original.text.utf16.elementsEqual(current.text.utf16)
}

private func sameField(_ original: GrammarField, _ current: GrammarField, selection: CFRange) -> Bool {
    return sameTextField(original, current) && selection.location == current.selection?.location
        && selection.length == current.selection?.length
}

private func sameRange(_ first: CFRange?, _ second: CFRange?) -> Bool {
    return first?.location == second?.location && first?.length == second?.length
}

private func select(_ range: CFRange, in element: AXUIElement) -> Bool {
    var range = range
    guard let value = AXValueCreate(.cfRange, &range) else { return false }
    return AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, value) == .success
}

private func grammarEdit(from original: String, to corrected: String) -> (offset: Int, removed: String, inserted: String) {
    var start = original.startIndex
    var correctedStart = corrected.startIndex
    while start < original.endIndex, correctedStart < corrected.endIndex,
          original[start].utf16.elementsEqual(corrected[correctedStart].utf16) {
        original.formIndex(after: &start)
        corrected.formIndex(after: &correctedStart)
    }

    var end = original.endIndex
    var correctedEnd = corrected.endIndex
    while end > start, correctedEnd > correctedStart {
        let previous = original.index(before: end)
        let correctedPrevious = corrected.index(before: correctedEnd)
        guard original[previous].utf16.elementsEqual(corrected[correctedPrevious].utf16) else { break }
        end = previous
        correctedEnd = correctedPrevious
    }
    // Gecko replaces a selection. For insertions, include a neighboring
    // character so the browser has a nonempty selection at the intended offset.
    if start == end, correctedStart != correctedEnd {
        if start > original.startIndex {
            original.formIndex(before: &start)
            corrected.formIndex(before: &correctedStart)
        } else if end < original.endIndex {
            original.formIndex(after: &end)
            corrected.formIndex(after: &correctedEnd)
        }
    }
    return (original[..<start].utf16.count, String(original[start..<end]), String(corrected[correctedStart..<correctedEnd]))
}

private func grammarParagraphEdits(from original: String, to corrected: String)
    -> [(offset: Int, removed: String, inserted: String)]? {
    let breaks = original.filter(\.isNewline)
    guard breaks.utf16.elementsEqual(corrected.filter(\.isNewline).utf16) else { return nil }
    let originalLines = original.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline)
    let correctedLines = corrected.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline)
    var edits: [(offset: Int, removed: String, inserted: String)] = []
    var offset = 0
    var newline = breaks.startIndex
    for (before, after) in zip(originalLines, correctedLines) {
        if !before.utf16.elementsEqual(after.utf16) {
            let edit = grammarEdit(from: String(before), to: String(after))
            guard !edit.removed.isEmpty else { return nil }
            edits.append((offset + edit.offset, edit.removed, edit.inserted))
        }
        offset += before.utf16.count
        if newline < breaks.endIndex {
            offset += breaks[newline].utf16.count
            breaks.formIndex(after: &newline)
        }
    }
    return edits
}

private func rangeAttribute(_ element: AXUIElement, _ name: String, range: CFRange) -> CFTypeRef? {
    var range = range
    guard let parameter = AXValueCreate(.cfRange, &range) else { return nil }
    var value: CFTypeRef?
    guard AXUIElementCopyParameterizedAttributeValue(element, name as CFString, parameter, &value)
        == .success else { return nil }
    return value
}

private func canReplaceRichText(_ element: AXUIElement, range: CFRange, removed: String) -> Bool {
    guard !removed.contains("\u{FFFC}"),
          let text = rangeAttribute(element, kAXAttributedStringForRangeParameterizedAttribute, range: range)
              as? NSAttributedString,
          text.string.utf16.elementsEqual(removed.utf16), text.length > 0 else { return false }

    let formatting = NSMutableAttributedString(attributedString: text)
    let entireRange = NSRange(location: 0, length: formatting.length)
    for key in ["AXMisspelled", "AXMarkedMisspelled", "AXGrammarError", "AXDidSpellCheck"] {
        formatting.removeAttribute(NSAttributedString.Key(key), range: entireRange)
    }
    var run = NSRange()
    let attributes = formatting.attributes(at: 0, longestEffectiveRange: &run, in: entireRange)
    // Preserve formatting outside the edit and leave mixed styles and links for review.
    return run.length == text.length && attributes[.link] == nil
        && attributes[NSAttributedString.Key("AXLink")] == nil
}

private func replaceRichText(
    _ original: GrammarField, correction: String, currentField: () -> GrammarField?
) -> String {
    guard isSettable(original.element, kAXSelectedTextAttribute) else { return "preview" }
    guard let current = currentField(), sameTextField(original, current),
          sameRange(original.reportedSelection, current.reportedSelection),
          original.textToCorrect.utf16.elementsEqual(current.textToCorrect.utf16) else {
        return "changed"
    }

    let baseOffset: Int
    if original.textToCorrect.utf16.elementsEqual(original.text.utf16) {
        baseOffset = 0
    } else if let selection = original.selection, selection.length > 0 {
        baseOffset = selection.location
    } else {
        // The browser's range can be valid even when its flattened AXValue
        // normalizes whitespace differently. Verify against the editor itself.
        guard let range = original.reportedSelection, range.length > 0,
              original.textToCorrect.rangeOfCharacter(from: .newlines) == nil,
              correction.rangeOfCharacter(from: .newlines) == nil,
              canReplaceRichText(current.element, range: range, removed: original.textToCorrect),
              let latest = currentField(), sameTextField(original, latest),
              sameRange(latest.reportedSelection, range),
              latest.textToCorrect.utf16.elementsEqual(original.textToCorrect.utf16) else {
            return "preview"
        }
        let result = AXUIElementSetAttributeValue(
            latest.element, kAXSelectedTextAttribute as CFString, correction as CFString
        )
        let insertedRange = CFRange(location: range.location, length: correction.utf16.count)
        for attempt in 0..<12 where result == .success {
            if attempt > 0 { Thread.sleep(forTimeInterval: 0.025) }
            if let inserted = rangeAttribute(latest.element, kAXStringForRangeParameterizedAttribute,
                                             range: insertedRange) as? String,
               inserted.utf16.elementsEqual(correction.utf16) { return "applied" }
        }
        return result == .success ? "partial" : "preview"
    }

    guard let edits = grammarParagraphEdits(from: original.textToCorrect, to: correction),
          !edits.isEmpty, edits.count <= 8 else { return "preview" }
    let changes = edits.reversed().map { edit in
        (range: CFRange(location: baseOffset + edit.offset, length: edit.removed.utf16.count),
         removed: edit.removed, inserted: edit.inserted)
    }
    guard changes.allSatisfy({
        canReplaceRichText(original.element, range: $0.range, removed: $0.removed)
    }) else {
        return "preview"
    }

    var before = current
    var failure = "preview"
    for change in changes {
        let range = change.range
        guard let latest = currentField(), sameTextField(before, latest),
              sameRange(before.reportedSelection, latest.reportedSelection) else {
            return failure == "partial" ? failure : "changed"
        }
        guard select(range, in: latest.element) else { return failure }

        // Browser editors may update their accessibility selection asynchronously.
        var target: GrammarField?
        for attempt in 0..<12 {
            if attempt > 0 { Thread.sleep(forTimeInterval: 0.025) }
            guard let selected = currentField() else { continue }
            guard sameTextField(before, selected) else { return failure == "partial" ? failure : "changed" }
            if sameField(before, selected, selection: range) {
                target = selected
                break
            }
            if let selection = selected.reportedSelection,
               !sameRange(selection, before.reportedSelection), !sameRange(selection, range) {
                return failure == "partial" ? failure : "changed"
            }
        }
        guard let target = target else { return failure }
        let result = AXUIElementSetAttributeValue(
            target.element, kAXSelectedTextAttribute as CFString, change.inserted as CFString
        )
        let expected = (before.text as NSString).replacingCharacters(
            in: NSRange(location: range.location, length: range.length), with: change.inserted
        )
        var applied: GrammarField?
        for attempt in 0..<12 where result == .success {
            if attempt > 0 { Thread.sleep(forTimeInterval: 0.025) }
            if let actual = currentField(), CFEqual(target.element, actual.element),
               actual.text.utf16.elementsEqual(expected.utf16) {
                applied = actual
                break
            }
        }
        guard let updated = applied else {
            if let latest = currentField(), sameField(before, latest, selection: range) {
                let previousSelection = before.selection
                    ?? CFRange(location: range.location + range.length, length: 0)
                _ = select(previousSelection, in: latest.element)
                return failure
            }
            return "partial"
        }
        before = updated
        failure = "partial"
    }
    return "applied"
}

private func runGrammarCorrection() {
    guard AXIsProcessTrusted() else { writeOutput("permission"); return }
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, 1)
    guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier else {
        writeOutput("unsupported")
        return
    }
    let app = AXUIElementCreateApplication(pid)
    // Reading the application role activates Gecko's accessibility tree on demand.
    _ = attribute(app, kAXRoleAttribute)
    var captured: GrammarField?
    var initialFocus: AXUIElement?
    for attempt in 0..<4 {
        if attempt > 0 { Thread.sleep(forTimeInterval: 0.08) }
        guard let focused = grammarFocus(system, app, pid: pid) else { continue }
        if let initialFocus = initialFocus, !CFEqual(initialFocus, focused) { break }
        if let field = grammarField(focused, pid: pid) {
            initialFocus = focused
            captured = field
            if !field.textToCorrect.isEmpty { break }
        } else {
            let role = attribute(focused, kAXRoleAttribute) as? String
            if role == kAXTextFieldRole || role == kAXTextAreaRole { initialFocus = focused }
        }
    }
    guard let original = captured, let focus = grammarFocus(system, app, pid: pid),
          CFEqual(focus, original.focus) else { writeOutput("unsupported"); return }

    let text = original.textToCorrect
    guard text.utf16.count <= 16000 else { writeOutput("tooLong"); return }
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        writeOutput("empty")
        return
    }
    guard let data = try? JSONEncoder().encode(text) else { return }
    writeOutput("text:" + String(decoding: data, as: UTF8.self))

    guard let line = readLine(), let command = line.data(using: .utf8),
          let correction = try? JSONDecoder().decode(String.self, from: command) else { return }
    func currentField() -> GrammarField? {
        guard let focus = grammarFocus(system, app, pid: pid), CFEqual(focus, original.focus) else { return nil }
        return grammarField(focus, pid: pid)
    }
    if !original.singleLine || original.selection == nil {
        writeOutput(replaceRichText(original, correction: correction, currentField: currentField))
        return
    }
    guard let selection = original.selection else {
        writeOutput("preview")
        return
    }
    guard let current = currentField(), sameField(original, current, selection: selection) else {
        writeOutput("changed")
        return
    }
    guard current.singleLine, correction.rangeOfCharacter(from: .newlines) == nil else {
        writeOutput("preview")
        return
    }
    let range = selection.length > 0
        ? selection
        : CFRange(location: 0, length: original.text.utf16.count)

    if !isSettable(current.element, kAXSelectedTextAttribute) {
        // Some web inputs expose a value setter but no selected-text setter.
        // Only use it on leaf text fields so embedded markup is preserved.
        guard current.canSetValue,
              let children = attribute(current.element, kAXChildrenAttribute) as? [Any],
              children.isEmpty else {
            writeOutput("preview")
            return
        }
        guard let latest = currentField(), latest.singleLine, latest.canSetValue,
              sameField(original, latest, selection: selection) else {
            writeOutput("changed")
            return
        }
        let value = (latest.text as NSString).replacingCharacters(
            in: NSRange(location: range.location, length: range.length), with: correction
        )
        let result = AXUIElementSetAttributeValue(latest.element, kAXValueAttribute as CFString, value as CFString)
        writeOutput(result == .success ? "applied" : "preview")
        return
    }

    let mustSelect = selection.length == 0
    guard let latest = currentField(), sameField(original, latest, selection: selection) else {
        writeOutput("changed")
        return
    }
    if mustSelect {
        guard select(range, in: latest.element) else {
            writeOutput("preview")
            return
        }
        guard let selected = currentField(), sameField(original, selected, selection: range) else {
            writeOutput("changed")
            return
        }
    }
    let result = AXUIElementSetAttributeValue(
        latest.element, kAXSelectedTextAttribute as CFString, correction as CFString
    )
    if result != .success, mustSelect, let latest = currentField(),
       sameField(original, latest, selection: range) {
        _ = select(selection, in: latest.element)
    }
    writeOutput(result == .success ? "applied" : "preview")
}

if CommandLine.arguments.dropFirst().first == "--grammar-correction" {
    runGrammarCorrection()
    exit(0)
}

// Usage: macos-text-monitor <pid>
guard CommandLine.arguments.count >= 2,
      let targetPid = Int32(CommandLine.arguments[1]),
      targetPid > 0 else {
    writeError("Usage: macos-text-monitor <pid>")
    writeOutput("NO_ELEMENT")
    exit(1)
}

monitoredPid = targetPid

// Read original text from stdin
var originalText = ""
if let line = readLine(strippingNewline: true) {
    originalText = line
}

// Target the specific application by PID (passed from the Electron host
// which captures it BEFORE the overlay steals focus).
let appElement = AXUIElementCreateApplication(monitoredPid)
let maxRetries = 5
var focusedElement: AXUIElement? = nil

for attempt in 1...maxRetries {
    var elementValue: AnyObject?
    let elementResult = AXUIElementCopyAttributeValue(
        appElement,
        kAXFocusedUIElementAttribute as CFString,
        &elementValue
    )

    if elementResult == .success, let element = elementValue {
        focusedElement = (element as! AXUIElement)
        if attempt > 1 {
            writeError("Got focused element on attempt \(attempt)")
        }
        break
    } else {
        writeError("Attempt \(attempt)/\(maxRetries): Cannot get focused element for PID \(monitoredPid) (error: \(elementResult.rawValue))")
    }

    if attempt < maxRetries {
        Thread.sleep(forTimeInterval: 0.3)
    }
}

guard let resolvedElement = focusedElement else {
    writeOutput("NO_ELEMENT")
    exit(1)
}

monitoredElement = resolvedElement
writeError("Monitoring element in PID \(monitoredPid)")

// Read initial value
guard let initialValue = readCurrentValue() else {
    writeError("Focused element has no text value")
    writeOutput("NO_VALUE")
    exit(0)
}

writeTextOutput("INITIAL_VALUE", initialValue)

// Create AXObserver for the target application's PID
var createdObserver: AXObserver?
let observerResult = AXObserverCreate(monitoredPid, observerCallback, &createdObserver)

guard observerResult == .success, let obs = createdObserver else {
    writeError("Failed to create AXObserver (error: \(observerResult.rawValue))")
    exit(1)
}

observer = obs

// Watch for value changes
let addResult = AXObserverAddNotification(
    obs,
    monitoredElement!,
    kAXValueChangedNotification as CFString,
    nil
)

if addResult != .success {
    writeError("Failed to add notification (error: \(addResult.rawValue))")
    exit(1)
}

// Add observer to run loop
CFRunLoopAddSource(
    CFRunLoopGetCurrent(),
    AXObserverGetRunLoopSource(obs),
    .commonModes
)

// Schedule auto-exit after timeout
DispatchQueue.main.asyncAfter(deadline: .now() + TIMEOUT_SECONDS) {
    CFRunLoopStop(CFRunLoopGetCurrent())
}

// Handle SIGTERM for clean exit
let signalSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
signal(SIGTERM, SIG_IGN)
signalSource.setEventHandler {
    CFRunLoopStop(CFRunLoopGetCurrent())
}
signalSource.resume()

CFRunLoopRun()
