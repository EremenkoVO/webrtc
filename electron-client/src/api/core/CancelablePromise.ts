export class CancelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CancelError'
  }
  public get isCancelled(): boolean {
    return true
  }
}

export interface OnCancel {
  readonly isResolved: boolean
  readonly isRejected: boolean
  readonly isCancelled: boolean
  (cancelHandler: () => void): void
}

export class CancelablePromise<T> implements Promise<T> {
  #isResolved = false
  #isRejected = false
  #isCancelled = false
  readonly #cancelHandlers: (() => void)[] = []
  readonly #promise: Promise<T>
  #reject?: (reason?: unknown) => void

  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      onCancel: OnCancel
    ) => void
  ) {
    this.#promise = new Promise<T>((resolve, reject) => {
      this.#reject = reject
      const onCancel = (cancelHandler: () => void): void => {
        if (this.#isResolved || this.#isRejected || this.#isCancelled) return
        this.#cancelHandlers.push(cancelHandler)
      }
      Object.defineProperty(onCancel, 'isResolved', { get: () => this.#isResolved })
      Object.defineProperty(onCancel, 'isRejected', { get: () => this.#isRejected })
      Object.defineProperty(onCancel, 'isCancelled', { get: () => this.#isCancelled })
      executor(resolve, reject, onCancel as OnCancel)
    })
  }

  get [Symbol.toStringTag]() {
    return 'Cancellable Promise'
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.#promise.then(onFulfilled, onRejected)
  }

  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this.#promise.catch(onRejected)
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.#promise.finally(onFinally)
  }

  cancel(): void {
    if (this.#isResolved || this.#isRejected || this.#isCancelled) return
    this.#isCancelled = true
    for (const h of this.#cancelHandlers) {
      try {
        h()
      } catch (e) {
        console.warn('Cancel handler error', e)
      }
    }
    this.#cancelHandlers.length = 0
    this.#reject?.(new CancelError('Request aborted'))
  }

  get isCancelled(): boolean {
    return this.#isCancelled
  }
}
