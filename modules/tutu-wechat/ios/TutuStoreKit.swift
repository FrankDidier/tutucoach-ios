import Foundation
import StoreKit

// App Store 自动续期订阅（StoreKit 2）。交易的 JWS 交给服务器校验后开通会员。
@objc(TutuStoreKit)
public class TutuStoreKit: NSObject {
  private static var updates: Task<Void, Never>?

  private static func info(_ v: VerificationResult<Transaction>) -> [String: Any]? {
    guard case .verified(let tx) = v else { return nil }
    var out: [String: Any] = [
      "jws": v.jwsRepresentation,
      "productId": tx.productID,
      "transactionId": String(tx.id),
      "originalTransactionId": String(tx.originalID),
    ]
    if let exp = tx.expirationDate { out["expiresMs"] = Int(exp.timeIntervalSince1970 * 1000) }
    if tx.revocationDate != nil { out["revoked"] = true }
    return out
  }

  private static func period(_ p: Product.SubscriptionPeriod?) -> String {
    guard let p = p else { return "" }
    switch p.unit {
    case .day: return "\(p.value)D"
    case .week: return "\(p.value)W"
    case .month: return "\(p.value)M"
    case .year: return "\(p.value)Y"
    @unknown default: return ""
    }
  }

  /// 续费、家长批准后到账等不经过购买按钮的交易，也要收下并结束，否则会一直挂着。
  @objc(startObserving:)
  public static func startObserving(_ onTransaction: @escaping ([String: Any]) -> Void) {
    if updates != nil { return }
    updates = Task.detached {
      for await v in Transaction.updates {
        if case .verified(let tx) = v {
          if let i = info(v) { onTransaction(i) }
          await tx.finish()
        }
      }
    }
  }

  @objc(products:completion:)
  public static func products(_ ids: [String], completion: @escaping ([[String: Any]]?, String?) -> Void) {
    Task {
      do {
        let list = try await Product.products(for: ids)
        completion(list.map { p in
          [
            "id": p.id,
            "displayName": p.displayName,
            "description": p.description,
            "displayPrice": p.displayPrice,
            "price": NSDecimalNumber(decimal: p.price).doubleValue,
            "period": period(p.subscription?.subscriptionPeriod),
          ]
        }, nil)
      } catch {
        completion(nil, error.localizedDescription)
      }
    }
  }

  @objc(purchase:accountToken:completion:)
  public static func purchase(_ id: String, accountToken: String?,
                              completion: @escaping ([String: Any]?, String?) -> Void) {
    Task {
      do {
        guard let product = try await Product.products(for: [id]).first else {
          completion(nil, "not_found")
          return
        }
        var options: Set<Product.PurchaseOption> = []
        if let t = accountToken, let uuid = UUID(uuidString: t) {
          options.insert(.appAccountToken(uuid))
        }
        let result = try await product.purchase(options: options)
        switch result {
        case .success(let v):
          guard case .verified(let tx) = v, let i = info(v) else {
            completion(nil, "unverified")
            return
          }
          await tx.finish()
          completion(i, nil)
        case .userCancelled:
          completion(nil, "cancelled")
        case .pending:
          completion(nil, "pending")
        @unknown default:
          completion(nil, "unknown")
        }
      } catch {
        completion(nil, error.localizedDescription)
      }
    }
  }

  /// 恢复购买：先和 App Store 同步，再列出当前有效的订阅。
  @objc(restore:completion:)
  public static func restore(_ sync: Bool, completion: @escaping ([[String: Any]], String?) -> Void) {
    Task {
      var err: String? = nil
      if sync {
        do { try await AppStore.sync() } catch { err = error.localizedDescription }
      }
      var out: [[String: Any]] = []
      for await v in Transaction.currentEntitlements {
        if let i = info(v) { out.append(i) }
      }
      completion(out, err)
    }
  }
}
