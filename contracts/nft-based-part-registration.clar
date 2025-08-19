;; AutoProof Parts Registry Contract
;; Clarity v2
;; Manages NFT-based registration of automotive parts with metadata, lifecycle tracking, and anti-counterfeiting measures

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-REGISTERED u101)
(define-constant ERR-NOT-FOUND u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-INVALID-METADATA u105)
(define-constant ERR-NOT-OWNER u106)
(define-constant ERR-ALREADY-RECYCLED u107)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var part-counter uint u0)

;; NFT-related data
(define-non-fungible-token auto-part uint)
(define-map part-metadata
  { part-id: uint }
  { 
    serial-number: (string-ascii 64),
    manufacturer: principal,
    production-date: uint,
    material-spec: (string-ascii 128),
    status: (string-ascii 32), ;; active, installed, recycled
    last-owner: principal,
    origin-factory: (string-ascii 64)
  }
)
(define-map part-ownership { part-id: uint } { owner: principal })
(define-map part-history 
  { part-id: uint, history-index: uint }
  { 
    event: (string-ascii 64),
    timestamp: uint,
    actor: principal
  }
)
(define-map history-counter { part-id: uint } { count: uint })

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate metadata
(define-private (validate-metadata (serial (string-ascii 64)) (material (string-ascii 128)) (origin (string-ascii 64)))
  (and 
    (> (len serial) u0)
    (> (len material) u0)
    (> (len origin) u0)
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Register a new part as NFT
(define-public (register-part 
  (serial-number (string-ascii 64))
  (material-spec (string-ascii 128))
  (origin-factory (string-ascii 64)))
  (let
    (
      (part-id (+ (var-get part-counter) u1))
      (manufacturer tx-sender)
    )
    (begin
      (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
      (asserts! (validate-metadata serial-number material-spec origin-factory) (err ERR-INVALID-METADATA))
      (asserts! (is-none? (map-get? part-metadata { part-id: part-id })) (err ERR-ALREADY-REGISTERED))
      (try! (nft-mint? auto-part part-id manufacturer))
      (map-set part-metadata 
        { part-id: part-id }
        { 
          serial-number: serial-number,
          manufacturer: manufacturer,
          production-date: block-height,
          material-spec: material-spec,
          status: "active",
          last-owner: manufacturer,
          origin-factory: origin-factory
        }
      )
      (map-set part-ownership { part-id: part-id } { owner: manufacturer })
      (map-set history-counter { part-id: part-id } { count: u1 })
      (map-set part-history 
        { part-id: part-id, history-index: u1 }
        { event: "registered", timestamp: block-height, actor: manufacturer }
      )
      (var-set part-counter part-id)
      (ok part-id)
    )
  )
)

;; Transfer part ownership
(define-public (transfer-part (part-id uint) (new-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq new-owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let
      (
        (current-owner (unwrap! (map-get? part-ownership { part-id: part-id }) (err ERR-NOT-FOUND)))
        (metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err ERR-NOT-FOUND)))
      )
      (asserts! (is-eq (get owner current-owner) tx-sender) (err ERR-NOT-OWNER))
      (asserts! (not (is-eq (get status metadata) "recycled")) (err ERR-ALREADY-RECYCLED))
      (try! (nft-transfer? auto-part part-id tx-sender new-owner))
      (map-set part-ownership { part-id: part-id } { owner: new-owner })
      (map-set part-metadata 
        { part-id: part-id }
        (merge metadata { last-owner: new-owner })
      )
      (let
        (
          (history-index (+ (default-to u0 (get count (map-get? history-counter { part-id: part-id }))) u1))
        )
        (map-set part-history 
          { part-id: part-id, history-index: history-index }
          { event: "transferred", timestamp: block-height, actor: tx-sender }
        )
        (map-set history-counter { part-id: part-id } { count: history-index })
      )
      (ok true)
    )
  )
)

;; Update part status (e.g., installed, recycled)
(define-public (update-part-status (part-id uint) (new-status (string-ascii 32)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (let
      (
        (metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err ERR-NOT-FOUND)))
      )
      (asserts! (not (is-eq (get status metadata) "recycled")) (err ERR-ALREADY-RECYCLED))
      (map-set part-metadata 
        { part-id: part-id }
        (merge metadata { status: new-status })
      )
      (let
        (
          (history-index (+ (default-to u0 (get count (map-get? history-counter { part-id: part-id }))) u1))
        )
        (map-set part-history 
          { part-id: part-id, history-index: history-index }
          { event: (concat "status-updated-" new-status), timestamp: block-height, actor: tx-sender }
        )
        (map-set history-counter { part-id: part-id } { count: history-index })
      )
      (ok true)
    )
  )
)

;; Burn a part NFT (e.g., for recycling)
(define-public (burn-part (part-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (let
      (
        (metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err ERR-NOT-FOUND)))
        (current-owner (unwrap! (map-get? part-ownership { part-id: part-id }) (err ERR-NOT-FOUND)))
      )
      (asserts! (is-eq (get owner current-owner) tx-sender) (err ERR-NOT-OWNER))
      (asserts! (not (is-eq (get status metadata) "recycled")) (err ERR-ALREADY-RECYCLED))
      (try! (nft-burn? auto-part part-id tx-sender))
      (map-set part-metadata 
        { part-id: part-id }
        (merge metadata { status: "recycled" })
      )
      (let
        (
          (history-index (+ (default-to u0 (get count (map-get? history-counter { part-id: part-id }))) u1))
        )
        (map-set part-history 
          { part-id: part-id, history-index: history-index }
          { event: "burned", timestamp: block-height, actor: tx-sender }
        )
        (map-set history-counter { part-id: part-id } { count: history-index })
      )
      (ok true)
    )
  )
)

;; Read-only: get part metadata
(define-read-only (get-part-metadata (part-id uint))
  (match (map-get? part-metadata { part-id: part-id })
    metadata (ok metadata)
    (err ERR-NOT-FOUND)
  )
)

;; Read-only: get part owner
(define-read-only (get-part-owner (part-id uint))
  (match (map-get? part-ownership { part-id: part-id })
    ownership (ok (get owner ownership))
    (err ERR-NOT-FOUND)
  )
)

;; Read-only: get part history
(define-read-only (get-part-history (part-id uint) (index uint))
  (match (map-get? part-history { part-id: part-id, history-index: index })
    history (ok history)
    (err ERR-NOT-FOUND)
  )
)

;; Read-only: get history count
(define-read-only (get-history-count (part-id uint))
  (ok (default-to u0 (get count (map-get? history-counter { part-id: part-id }))))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get total parts
(define-read-only (get-total-parts)
  (ok (var-get part-counter))
)