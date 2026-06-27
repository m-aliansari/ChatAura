import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import vm from "node:vm"

// vitest runs with cwd at the client package root.
const SW_PATH = path.resolve(process.cwd(), "public/firebase-messaging-sw.js")
const SW_SOURCE = readFileSync(SW_PATH, "utf8")

/**
 * Loads the real service-worker file into a sandbox with faked SW globals,
 * and returns the captured handlers so we can drive them directly.
 */
function loadServiceWorker() {
    let backgroundHandler
    const listeners = {}

    const registration = { showNotification: vi.fn() }
    const clients = {
        matchAll: vi.fn(),
        openWindow: vi.fn(),
    }
    const self = {
        registration,
        location: { origin: "https://app.test" },
        addEventListener: (type, cb) => {
            listeners[type] = cb
        },
    }

    const sandbox = {
        importScripts: () => {},
        firebase: {
            initializeApp: () => {},
            messaging: () => ({
                onBackgroundMessage: (cb) => {
                    backgroundHandler = cb
                },
            }),
        },
        self,
        clients,
        console,
        URL,
        Set,
        setTimeout: () => {},
    }

    vm.runInNewContext(SW_SOURCE, sandbox)

    return {
        backgroundHandler,
        clickHandler: listeners.notificationclick,
        registration,
        clients,
    }
}

describe("firebase-messaging-sw onBackgroundMessage", () => {
    let sw
    beforeEach(() => {
        sw = loadServiceWorker()
    })

    it("shows a notification mapping title/body/icon from the payload", () => {
        sw.backgroundHandler({
            notification: { title: "New Message", body: "hi there", icon: "/x.png" },
            data: { messageId: "m1", url: "/home?userId=u1", fromUserId: "u1" },
        })

        expect(sw.registration.showNotification).toHaveBeenCalledOnce()
        const [title, options] = sw.registration.showNotification.mock.calls[0]
        expect(title).toBe("New Message")
        expect(options.body).toBe("hi there")
        expect(options.icon).toBe("/x.png")
        expect(options.tag).toBe("m1")
        expect(options.data.url).toBe("#/home?userId=u1") // hash-routing prefix
        expect(options.data.fromUserId).toBe("u1")
    })

    it("falls back to defaults when fields are missing", () => {
        sw.backgroundHandler({ data: {} })
        const [title, options] = sw.registration.showNotification.mock.calls[0]
        expect(title).toBe("New Notification")
        expect(options.icon).toBe("/default-icon.png")
        expect(options.tag).toBe("default-tag")
        expect(options.data.url).toBe("#/home")
    })

    it("dedupes a repeated messageId (same tag shown only once)", () => {
        const payload = {
            notification: { title: "New Message", body: "dup" },
            data: { messageId: "same-tag" },
        }
        sw.backgroundHandler(payload)
        sw.backgroundHandler(payload)
        expect(sw.registration.showNotification).toHaveBeenCalledOnce()
    })

    it("shows separate notifications for different messageIds", () => {
        sw.backgroundHandler({ notification: { title: "a" }, data: { messageId: "t1" } })
        sw.backgroundHandler({ notification: { title: "b" }, data: { messageId: "t2" } })
        expect(sw.registration.showNotification).toHaveBeenCalledTimes(2)
    })
})

describe("firebase-messaging-sw notificationclick", () => {
    let sw
    beforeEach(() => {
        sw = loadServiceWorker()
    })

    // The handler calls event.waitUntil(promise) but does not return it, so we
    // capture that promise and await it to let the async chain settle.
    function makeEvent(data) {
        const event = {
            notification: { close: vi.fn(), data },
            waitUntil: (p) => {
                event._promise = p
            },
        }
        return event
    }

    it("focuses an existing app tab and posts OPEN_CHAT with the sender id", async () => {
        const postMessage = vi.fn()
        const focus = vi.fn().mockResolvedValue({ postMessage })
        sw.clients.matchAll.mockResolvedValue([
            { url: "https://app.test/#/home", focus },
        ])

        const event = makeEvent({ url: "/home?userId=u9", fromUserId: "u9" })
        sw.clickHandler(event)
        await event._promise

        expect(event.notification.close).toHaveBeenCalled()
        expect(focus).toHaveBeenCalled()
        expect(postMessage).toHaveBeenCalledWith({ type: "OPEN_CHAT", userId: "u9" })
        expect(sw.clients.openWindow).not.toHaveBeenCalled()
    })

    it("opens a new window when no matching tab exists", async () => {
        sw.clients.matchAll.mockResolvedValue([])

        const event = makeEvent({ url: "/home?userId=u9", fromUserId: "u9" })
        sw.clickHandler(event)
        await event._promise

        expect(sw.clients.openWindow).toHaveBeenCalledOnce()
        const [targetUrl] = sw.clients.openWindow.mock.calls[0]
        expect(targetUrl).toContain("#/home?userId=u9")
    })
})
