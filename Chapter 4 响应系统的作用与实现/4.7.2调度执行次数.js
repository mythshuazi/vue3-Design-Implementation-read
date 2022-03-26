// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap

// 存储副作用函数的桶
const bucket = new WeakMap()

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = []

const effect = (fn, options) => {
    const effectFn = () => {
        // 调用 cleanup 函数完成清除工作
        cleanup(effectFn)

        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn

        // 在调用副作用函数之前将当前副作用函数压入栈中
        effectStack.push(effectFn)
        
        fn()

        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
        effectStack.pop() 
        activeEffect = effectStack[effectStack.length - 1]
    }

    // 将 options 挂在到 effectFn 上
    effectFn.options = options // 新增

    // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
    effectFn.deps = []

    // 执行副作用函数
    effectFn()
}

function cleanup (effectFn) {
    // 遍历 effectFn.deps 数组
    for (let i = 0; i < effectFn.deps.length; i++) {
        // deps 是依赖集合
        const deps = effectFn.deps[i]
        // 将 effectFn 从依赖集合中移除
        deps.delete(effectFn)
    }

    // 最后需要重置 effectFn.deps 数组
    effectFn.deps.length = 0
}

// 原始数据
const data = { foo: 1 }

const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
        track(target, key)

        // 返回属性值
        return target[key]
    },

    // 拦截设置操作
    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        // 把副作用函数从桶里取出并执行
        trigger(target, key)
    }
})

// 在 get 拦截函数内调用 track 函数追踪变化
function track (target, key) {
    // 没有 activeEffect ，直接 return
    if (!activeEffect) return

    let depsMap = bucket.get(target)

    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }

    // 把当前激活的副作用函数添加到依赖集合 deps 中
    deps.add(activeEffect)

    // deps 就是一个与当前副作用函数存在联系的依赖集合
    // 将其添加到 activeEffect.deps 数组中
    activeEffect.deps.push(deps)
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger (target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })
    effectsToRun.forEach(effectFn => {
        // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
        if (effectFn?.options?.scheduler) { // 新增
            effectFn.options.scheduler(effectFn) // 新增
        } else {
            effectFn()
        }
    })
}

// 定义一个任务队列
const jobQueue = new Set()
// 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve()

// 一个标志代表是否正在刷新队列
let isFlushing = false
function flushJob () {
    // 如果队列正在刷新，则什么都不做
    if (isFlushing) return
    // 设置为 true，代表正在刷新
    isFlushing = true

    // 在微任务队列中刷新 jobQueue 队列
    p.then(() => {
        jobQueue.forEach(job => job())
    }).finally(() => {
        // 结束后重置 isFlushing
        isFlushing = false
    })
}




// 注册副作用函数
effect(
    () => {
        console.log(obj.foo)
    },
    {
        scheduler (fn) {
            jobQueue.add(fn)
            flushJob()
        }
    }
)

obj.foo++
obj.foo++

console.log('结束了')

/**
 * 执行顺序分析：
 * effect(..., ...) 正常收集依赖
 * 
 * 执行 obj.foo++
 * --触发 get -> track
 * --触发 set -> trigger
 * ----执行 scheduler
 * ------向 jobQueue 中添加 fn 待执行
 * ------执行 flushJob
 * --------isFlushing 为 false，继续执行
 * --------遇到 p.then 为微任务，微任务入栈，待执行
 * 
 * 执行第2个 obj.foo++
 * --触发 get -> track
 * --触发 set -> trigger
 * ----执行 scheduler
 * ------向 jobQueue 中添加 fn 待执行
 * ------执行 flushJob
 * --------isFlushing 为 true，return
 * 提取微任务栈，执行微任务
 * p.then(() => jobQueue.forEach(job => job()))
 *  .finally(() => { isFlushing = false }) 重置 isFlushing
 * 执行 console.log('结束了')
 * 
 * 一次 EventLoop 结束
 * 
 * 我认为的核心思想是：
 * 一个事件循环中，对同一属性的赋值操作可以是多次，但与该属性相关的副作用函数只会运行一次，
 * 这个实现的方式就是通过事件循环+微任务。
 * isFlushing 控制着副作用函数只执行一次的关键，它是在微任务执行之后才会被重置为 false，
 * 但在 jobQueue.forEach(job => job()) 执行前，可以向 jobQueue 里 add 多个副作用函数，
 * 由于它是 set 结构，因此同一个副作用函数即使 add 多次也会被去重
 * 因此微任务
 * p.then(() => {
 *   jobQueue.forEach(job => job())
 * })
 * 只会在同步代码结束后执行，即第二次 obj.foo++ 完毕后执行
 * 
 * 
 *（
 *  个人认为的事件循环：
 *  同步代码执行->微任务执行->宏任务执行->事件循环结束，等待下次代码执行（用户操作事件或宏任务队列执行）
 * )
 */